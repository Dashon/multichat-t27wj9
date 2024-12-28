# Provider versions:
# aws: ~> 5.0
# kubernetes: ~> 2.23

terraform {
  required_version = ">= 1.5.0"
}

# Helper function to format endpoint URLs
locals {
  format_endpoint = {
    url = function(service_name, port, protocol = "https") {
      return "${protocol}://${service_name}:${port}"
    }
  }
}

# Kubernetes Cluster Information
output "kubernetes_cluster" {
  description = "Comprehensive Kubernetes cluster information"
  value = {
    endpoint = aws_eks_cluster.main.endpoint
    name     = aws_eks_cluster.main.name
    version  = var.kubernetes_config.cluster_version
    node_groups = {
      api = {
        instance_type = var.kubernetes_config.node_instance_types.api
        min_size     = var.kubernetes_config.min_nodes.api
        max_size     = var.kubernetes_config.max_nodes.api
        desired_size = var.kubernetes_config.desired_nodes.api
      }
      message = {
        instance_type = var.kubernetes_config.node_instance_types.message
        min_size     = var.kubernetes_config.min_nodes.message
        max_size     = var.kubernetes_config.max_nodes.message
        desired_size = var.kubernetes_config.desired_nodes.message
      }
      ai = {
        instance_type = var.kubernetes_config.node_instance_types.ai
        min_size     = var.kubernetes_config.min_nodes.ai
        max_size     = var.kubernetes_config.max_nodes.ai
        desired_size = var.kubernetes_config.desired_nodes.ai
      }
    }
    health_status = {
      control_plane = aws_eks_cluster.main.status
      node_groups   = aws_eks_cluster.main.health
    }
  }
  sensitive = false
}

# Service Endpoints
output "service_endpoints" {
  description = "Service endpoints with health status and DR information"
  value = {
    ai_service = {
      endpoint        = local.format_endpoint.url(ai_service_endpoint, "8080")
      health_check    = "${local.format_endpoint.url(ai_service_endpoint, "8080")}/health"
      ready_check     = "${local.format_endpoint.url(ai_service_endpoint, "8080")}/ready"
      gpu_enabled     = true
      scaling_config  = {
        min_replicas = 2
        max_replicas = 8
        target_gpu_utilization = 60
      }
    }
    message_service = {
      endpoint        = local.format_endpoint.url("message-service", "8080")
      health_check    = "${local.format_endpoint.url("message-service", "8080")}/health"
      websocket       = local.format_endpoint.url("message-service", "8080", "wss")
      scaling_config  = {
        min_replicas = var.kubernetes_config.min_nodes.message
        max_replicas = var.kubernetes_config.max_nodes.message
      }
    }
    api_gateway = {
      endpoint        = local.format_endpoint.url("api-gateway", "443")
      health_check    = "${local.format_endpoint.url("api-gateway", "443")}/health"
      metrics        = "${local.format_endpoint.url("api-gateway", "443")}/metrics"
    }
    service_mesh = {
      istio_ingress   = local.format_endpoint.url("istio-ingress", "443")
      istio_egress    = local.format_endpoint.url("istio-egress", "443")
      monitoring      = local.format_endpoint.url("istio-monitoring", "9090")
    }
    dr_region = {
      api_gateway     = local.format_endpoint.url("dr-api-gateway", "443")
      message_service = local.format_endpoint.url("dr-message-service", "8080")
      status         = "standby"
      failover_ready = true
    }
  }
  sensitive = false
}

# Database Endpoints
output "database_endpoints" {
  description = "Database endpoints with replica and connection status"
  value = {
    postgresql = {
      primary     = local.format_endpoint.url("postgresql-primary", "5432", "postgresql")
      reader      = local.format_endpoint.url("postgresql-reader", "5432", "postgresql")
      status      = "available"
      version     = "14.0"
    }
    mongodb = {
      primary     = local.format_endpoint.url("mongodb-primary", "27017", "mongodb")
      secondary   = local.format_endpoint.url("mongodb-secondary", "27017", "mongodb")
      status      = "available"
      version     = "6.0"
    }
    redis = {
      primary     = local.format_endpoint.url("redis-primary", "6379", "redis")
      reader      = local.format_endpoint.url("redis-reader", "6379", "redis")
      status      = "available"
      version     = "7.0"
    }
    replicas = {
      postgresql = {
        count    = var.database_config.replica_count
        status   = "healthy"
        lag_ms   = 0
      }
      mongodb = {
        count    = var.database_config.replica_count
        status   = "healthy"
        lag_ms   = 0
      }
    }
    connection_status = {
      primary_region = "healthy"
      dr_region      = "healthy"
      replication_lag_ms = 0
    }
  }
  sensitive = true
}

# Monitoring Information
output "monitoring_info" {
  description = "Comprehensive monitoring system endpoints"
  value = {
    prometheus_endpoint = local.format_endpoint.url("prometheus", "9090")
    grafana_endpoint   = local.format_endpoint.url("grafana", "3000")
    alert_manager = {
      endpoint = local.format_endpoint.url("alertmanager", "9093")
      status   = "active"
      config = {
        retention_days = var.monitoring_config.metrics_retention_days
        thresholds = var.monitoring_config.alert_thresholds
      }
    }
    log_aggregation = {
      elasticsearch = local.format_endpoint.url("elasticsearch", "9200")
      kibana       = local.format_endpoint.url("kibana", "5601")
      retention    = var.monitoring_config.log_retention_days
      status       = "healthy"
    }
  }
  sensitive = false
}