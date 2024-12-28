# Development Environment Terraform Configuration
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
    bucket         = "ai-chat-platform-dev-tfstate"
    key            = "dev/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "ai-chat-platform-dev-tflock"
  }
}

# Local variables for development environment
locals {
  environment = "dev"
  region      = var.aws_region.primary

  # Development-specific tags
  tags = {
    Environment     = local.environment
    Project         = var.project_name
    ManagedBy       = "Terraform"
    CostCenter      = "development"
    AutoShutdown    = "true"
  }

  # Development-specific VPC configuration
  vpc_config = {
    cidr_block         = "10.0.0.0/16"
    availability_zones = ["us-west-2a"]  # Single AZ for dev
    private_subnets    = ["10.0.1.0/24"]
    public_subnets     = ["10.0.2.0/24"]
    enable_nat_gateway = true
    single_nat_gateway = true  # Single NAT for cost optimization
    enable_vpn_gateway = false
  }

  # Development-specific Kubernetes configuration
  kubernetes_config = {
    cluster_version = "1.27"
    node_instance_types = {
      api        = "t3.large"
      message    = "t3.large"
      ai         = "g4dn.xlarge"
      preference = "t3.large"
    }
    min_nodes = {
      api     = 1
      message = 1
      ai      = 1
    }
    max_nodes = {
      api     = 3
      message = 3
      ai      = 3
    }
    desired_nodes = {
      api     = 1
      message = 1
      ai      = 1
    }
    auto_scaling = {
      enabled           = true
      cpu_threshold     = 80
      memory_threshold  = 80
    }
  }
}

# AWS Provider configuration
provider "aws" {
  region = local.region
  
  default_tags {
    tags = local.tags
  }
}

# Networking module for development environment
module "networking" {
  source = "../../modules/networking"

  environment         = local.environment
  vpc_cidr           = local.vpc_config.cidr_block
  availability_zones = local.vpc_config.availability_zones
  nat_gateway_count  = 1  # Single NAT gateway for dev
  enable_vpn_gateway = false
  enable_flow_logs   = true  # Enable for debugging
}

# Kubernetes module for development environment
module "kubernetes" {
  source = "../../modules/kubernetes"

  environment       = local.environment
  cluster_version   = local.kubernetes_config.cluster_version
  vpc_config        = module.networking.vpc_config

  node_instance_types = local.kubernetes_config.node_instance_types
  node_counts = {
    min     = local.kubernetes_config.min_nodes
    max     = local.kubernetes_config.max_nodes
    desired = local.kubernetes_config.desired_nodes
  }

  enable_cluster_autoscaler = true
  enable_spot_instances     = true  # Use spot instances for cost optimization
}

# AI Service module for development environment
module "ai_service" {
  source = "../../modules/ai-service"

  environment = local.environment
  scaling_config = {
    min_size     = 1
    max_size     = 3
    desired_size = 1
  }
  instance_type         = "g4dn.xlarge"
  enable_gpu_monitoring = true
  auto_shutdown_enabled = true  # Enable auto-shutdown for cost savings
}

# API Gateway module for development environment
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment     = local.environment
  enable_waf      = true
  waf_rule_level  = "basic"  # Basic WAF rules for dev
  logging_level   = "INFO"
  enable_caching  = false    # Disable caching for development
  throttling_rate = 1000     # Higher rate limit for testing
  cors_enabled    = true     # Enable CORS for development
}

# Monitoring module for development environment
module "monitoring" {
  source = "../../modules/monitoring"

  environment    = local.environment
  retention_days = 30
  enable_alerts  = true
  alert_thresholds = {
    cpu_utilization    = 80
    memory_utilization = 80
    api_latency       = 2000  # 2 seconds
  }
  dashboard_enabled    = true
  detailed_monitoring = true  # Enable detailed monitoring for development
}

# Outputs
output "api_endpoint" {
  description = "API Gateway endpoint URL for development environment"
  value       = module.api_gateway.api_gateway_endpoint
}

output "ai_service_url" {
  description = "AI service endpoint URL for development environment"
  value       = module.ai_service.ai_service_endpoint
}