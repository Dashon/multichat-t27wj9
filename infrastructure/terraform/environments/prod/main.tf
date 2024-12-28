# Production Environment Terraform Configuration
# Version: 1.0.0
# Provider versions:
# - hashicorp/aws ~> 5.0
# - hashicorp/kubernetes ~> 2.23

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }

  backend "s3" {
    bucket         = "ai-chat-platform-prod-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Local variables for production environment
locals {
  environment = "prod"
  common_tags = {
    Environment = local.environment
    Project     = "ai-chat-platform"
    ManagedBy   = "terraform"
    LastUpdated = timestamp()
  }

  # Production-specific scaling parameters
  scaling_config = {
    api_pods = {
      min     = 2
      max     = 10
      desired = 3
    }
    message_pods = {
      min     = 3
      max     = 15
      desired = 5
    }
    ai_pods = {
      min     = 2
      max     = 8
      desired = 3
    }
  }

  # Monitoring thresholds for production
  monitoring_thresholds = {
    api_latency    = 2000  # 2 seconds max latency
    cpu_threshold  = 70    # 70% CPU utilization
    memory_threshold = 80  # 80% memory utilization
    error_rate     = 0.1   # 0.1% error rate threshold
  }
}

# Primary region provider configuration
provider "aws" {
  region = "us-west-2"
  alias  = "primary"

  default_tags {
    tags = local.common_tags
  }
}

# DR region provider configuration
provider "aws" {
  region = "us-east-1"
  alias  = "dr"

  default_tags {
    tags = local.common_tags
  }
}

# Primary region networking
module "primary_networking" {
  source = "../../modules/networking"
  providers = {
    aws = aws.primary
  }

  environment = local.environment
  vpc_config = {
    vpc_cidr = "10.0.0.0/16"
    availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
    enable_flow_logs  = true
  }
}

# DR region networking
module "dr_networking" {
  source = "../../modules/networking"
  providers = {
    aws = aws.dr
  }

  environment = local.environment
  vpc_config = {
    vpc_cidr = "10.1.0.0/16"
    availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
    enable_flow_logs  = true
  }
}

# Primary region monitoring
module "primary_monitoring" {
  source = "../../modules/monitoring"
  providers = {
    aws = aws.primary
  }

  environment = local.environment
  monitoring_config = {
    metrics_retention_days = 90
    ha_enabled = true
    performance_threshold = local.monitoring_thresholds
    alert_endpoints = ["ops@aichatplatform.com"]
  }

  depends_on = [module.primary_networking]
}

# DR region monitoring
module "dr_monitoring" {
  source = "../../modules/monitoring"
  providers = {
    aws = aws.dr
  }

  environment = local.environment
  monitoring_config = {
    metrics_retention_days = 90
    ha_enabled = true
    performance_threshold = local.monitoring_thresholds
    alert_endpoints = ["ops@aichatplatform.com"]
  }

  depends_on = [module.dr_networking]
}

# Database configuration for production
module "database" {
  source = "../../modules/database"
  providers = {
    aws = aws.primary
  }

  environment = local.environment
  database_config = {
    postgresql_instance = "db.r6g.xlarge"
    mongodb_instance   = "db.r6g.large"
    redis_node_type    = "cache.r6g.large"
    backup_retention_period = 7
    enable_multi_az    = true
    enable_cross_region_replica = true
    performance_insights_enabled = true
  }

  vpc_id = module.primary_networking.vpc_id
  subnet_ids = module.primary_networking.private_subnet_ids
}

# Route 53 health checks and DNS failover
resource "aws_route53_health_check" "primary_api" {
  fqdn              = "api.aichatplatform.com"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"

  tags = merge(local.common_tags, {
    Name = "primary-api-health-check"
  })
}

# DNS failover configuration
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.aichatplatform.com"
  type    = "A"

  failover_routing_policy {
    type = "PRIMARY"
  }

  set_identifier = "primary"
  health_check_id = aws_route53_health_check.primary_api.id

  alias {
    name                   = module.primary_networking.alb_dns_name
    zone_id                = module.primary_networking.alb_zone_id
    evaluate_target_health = true
  }
}

# Outputs for service endpoints and monitoring
output "service_endpoints" {
  value = {
    primary_api_url = "https://api.aichatplatform.com"
    dr_api_url      = "https://dr.api.aichatplatform.com"
    monitoring_url  = "https://monitoring.aichatplatform.com"
  }
  description = "Production service endpoints"
}

output "monitoring_endpoints" {
  value = {
    primary_prometheus = module.primary_monitoring.prometheus_endpoint
    primary_grafana    = module.primary_monitoring.grafana_endpoint
    dr_prometheus      = module.dr_monitoring.prometheus_endpoint
    dr_grafana        = module.dr_monitoring.grafana_endpoint
  }
  description = "Monitoring system endpoints"
}