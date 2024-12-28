# Main Terraform configuration for staging environment
# Version: 1.0.0
# Provider versions:
# aws: ~> 5.0
# kubernetes: ~> 2.23
# random: ~> 3.5

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
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    bucket         = "ai-chat-platform-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Local variables for staging environment
locals {
  environment = "staging"
  region      = "us-west-2"
  
  # Resource naming convention
  name_prefix = "ai-chat-staging"
  
  # Staging-specific tags
  common_tags = {
    Environment     = local.environment
    Project         = "ai-chat-platform"
    ManagedBy      = "Terraform"
    CostCenter     = "staging-ops"
    MaintenanceDay = "Saturday"
    AutoShutdown   = "true"
  }

  # Staging scaling parameters (25% of production)
  scaling_config = {
    min_capacity     = 2
    max_capacity     = 8
    desired_capacity = 3
    cpu_threshold    = 70
    memory_threshold = 80
  }

  # Monitoring thresholds for staging
  monitoring_thresholds = {
    api_latency_ms      = 2000
    message_delivery_ms = 2000
    error_rate_percent  = 5
    cpu_utilization    = 70
    memory_utilization = 80
  }
}

# Provider configuration
provider "aws" {
  region = local.region
  
  default_tags {
    tags = local.common_tags
  }
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", "${local.name_prefix}-cluster"]
  }
}

# Data sources
data "aws_eks_cluster" "cluster" {
  name = "${local.name_prefix}-cluster"
}

data "aws_eks_cluster_auth" "cluster" {
  name = "${local.name_prefix}-cluster"
}

# VPC Configuration for staging
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "${local.name_prefix}-vpc"
  cidr = "10.1.0.0/16"

  azs             = ["${local.region}a", "${local.region}b"]
  private_subnets = ["10.1.1.0/24", "10.1.2.0/24"]
  public_subnets  = ["10.1.101.0/24", "10.1.102.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = true
  enable_dns_hostnames   = true
  enable_dns_support     = true

  tags = merge(local.common_tags, {
    "kubernetes.io/cluster/${local.name_prefix}-cluster" = "shared"
  })
}

# AI Service Module
module "ai_service" {
  source = "../../modules/ai-service"

  environment = local.environment
  instance_type = "g4dn.xlarge"
  min_size = local.scaling_config.min_capacity
  max_size = local.scaling_config.max_capacity
  desired_size = local.scaling_config.desired_capacity
  
  monitoring_retention_days = 30
  auto_shutdown_enabled = true
  shutdown_schedule = "cron(0 20 ? * MON-FRI *)"
  startup_schedule = "cron(0 6 ? * MON-FRI *)"
  
  spot_enabled = true
  spot_price_max = "1.5"

  tags = local.common_tags
}

# API Gateway Module
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment = local.environment
  vpc_endpoint_enabled = true
  waf_enabled = true
  logging_enabled = true
  
  rate_limit = {
    rate = 1000
    burst = 2000
  }
  
  monitoring = {
    metrics_enabled = true
    logging_level = "INFO"
    retention_days = 30
  }
  
  security = {
    ssl_policy = "TLS-1-2-2021"
    minimum_compression_size = 1024
  }

  tags = local.common_tags
}

# Monitoring Module
module "monitoring" {
  source = "../../modules/monitoring"

  environment = local.environment
  alert_endpoints = ["staging-ops@company.com"]
  dashboard_refresh_rate = 300
  retention_period_days = 30
  
  thresholds = {
    cpu_utilization = local.monitoring_thresholds.cpu_utilization
    memory_utilization = local.monitoring_thresholds.memory_utilization
    api_latency_ms = local.monitoring_thresholds.api_latency_ms
    error_rate_percent = local.monitoring_thresholds.error_rate_percent
  }

  tags = local.common_tags
}

# Outputs
output "staging_endpoints" {
  description = "Staging environment endpoints"
  value = {
    api_endpoint = module.api_gateway.api_gateway_endpoint
    ai_service_endpoint = module.ai_service.ai_service_endpoint
    monitoring_dashboard = module.monitoring.dashboard_url
  }
}

output "staging_metrics" {
  description = "Staging environment metrics"
  value = {
    ai_service_metrics = module.ai_service.scaling_metrics
    api_gateway_metrics = module.api_gateway.waf_metrics
  }
}