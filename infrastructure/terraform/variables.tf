# terraform/variables.tf
# Version: 1.0.0
# Provider versions:
# - hashicorp/aws ~> 5.0
# - hashicorp/kubernetes ~> 2.23

terraform {
  required_version = ">= 1.5.0"
}

# Core project variables
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "project_name" {
  type        = string
  description = "Name of the project for resource naming"
  default     = "ai-chat-platform"
}

variable "aws_region" {
  type        = map(string)
  description = "AWS regions for primary and DR deployment"
  default = {
    primary   = "us-west-2"
    secondary = "us-east-1"
  }
}

# VPC Configuration
variable "vpc_config" {
  type = object({
    cidr_block           = string
    availability_zones   = list(string)
    private_subnets     = list(string)
    public_subnets      = list(string)
    enable_nat_gateway  = bool
    single_nat_gateway  = bool
    enable_vpn_gateway  = bool
  })
  description = "VPC configuration parameters for multi-AZ deployment"
}

# Kubernetes Configuration
variable "kubernetes_config" {
  type = object({
    cluster_version = string
    node_instance_types = object({
      api        = string
      message    = string
      ai         = string
      preference = string
    })
    min_nodes = object({
      api     = number
      message = number
      ai      = number
    })
    max_nodes = object({
      api     = number
      message = number
      ai      = number
    })
    desired_nodes = object({
      api     = number
      message = number
      ai      = number
    })
    auto_scaling = object({
      enabled           = bool
      cpu_threshold     = number
      memory_threshold  = number
    })
  })
  description = "Kubernetes cluster configuration with service-specific settings"

  default = {
    cluster_version = "1.27"
    node_instance_types = {
      api        = "t3.large"
      message    = "t3.large"
      ai         = "g4dn.xlarge"
      preference = "t3.large"
    }
    min_nodes = {
      api     = 2
      message = 3
      ai      = 2
    }
    max_nodes = {
      api     = 10
      message = 15
      ai      = 8
    }
    desired_nodes = {
      api     = 3
      message = 5
      ai      = 3
    }
    auto_scaling = {
      enabled           = true
      cpu_threshold     = 70
      memory_threshold  = 80
    }
  }
}

# Database Configuration
variable "database_config" {
  type = object({
    postgresql_instance          = string
    mongodb_instance            = string
    redis_node_type             = string
    backup_retention_days       = number
    multi_az                    = bool
    storage_encrypted           = bool
    performance_insights_enabled = bool
    deletion_protection         = bool
    replica_count              = number
  })
  description = "Database configuration parameters for high availability"

  default = {
    postgresql_instance          = "db.r6g.xlarge"
    mongodb_instance            = "db.r6g.xlarge"
    redis_node_type             = "cache.r6g.large"
    backup_retention_days       = 7
    multi_az                    = true
    storage_encrypted           = true
    performance_insights_enabled = true
    deletion_protection         = true
    replica_count              = 2
  }
}

# Monitoring Configuration
variable "monitoring_config" {
  type = object({
    metrics_retention_days      = number
    log_retention_days         = number
    alert_endpoints            = list(string)
    enable_detailed_monitoring = bool
    performance_threshold = object({
      api_latency_ms       = number
      message_delivery_ms  = number
      cpu_utilization     = number
      memory_utilization  = number
    })
    alert_thresholds = object({
      error_rate    = number
      latency_p95   = number
      disk_usage    = number
    })
  })
  description = "Comprehensive monitoring and alerting configuration"

  default = {
    metrics_retention_days      = 90
    log_retention_days         = 30
    alert_endpoints            = []
    enable_detailed_monitoring = true
    performance_threshold = {
      api_latency_ms      = 2000  # 2 seconds max latency
      message_delivery_ms = 2000  # 2 seconds delivery time
      cpu_utilization    = 70    # 70% CPU threshold
      memory_utilization = 80    # 80% memory threshold
    }
    alert_thresholds = {
      error_rate   = 1.0  # 1% error rate threshold
      latency_p95  = 2000 # 2 seconds 95th percentile
      disk_usage   = 85   # 85% disk usage threshold
    }
  }
}

# Resource Tags
variable "tags" {
  type        = map(string)
  description = "Common resource tags for cost allocation and management"
  default = {
    Project     = "AI-Enhanced Group Chat Platform"
    ManagedBy   = "Terraform"
    Environment = "var.environment"
  }
}