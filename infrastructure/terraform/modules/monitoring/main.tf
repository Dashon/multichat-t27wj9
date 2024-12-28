# Monitoring Module for AI-Enhanced Group Chat Platform
# Version: 1.0.0
# Provider versions:
# - hashicorp/aws ~> 5.0
# - hashicorp/kubernetes ~> 2.23
# - hashicorp/helm ~> 2.11

terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
}

# Create dedicated monitoring namespace with Istio injection enabled
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
    labels = {
      name             = "monitoring"
      "istio-injection" = "enabled"
      environment      = var.environment
      managed-by      = "terraform"
    }
  }
}

# Deploy Prometheus stack with high availability and security configurations
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = "15.10.0"

  values = [
    yamlencode({
      global: {
        scrape_interval: "15s"
        evaluation_interval: "15s"
      }
      server: {
        retention: "${var.monitoring_config.metrics_retention_days}d"
        persistentVolume: {
          enabled: true
          size: "100Gi"
          storageClass: "gp3"
        }
        resources: {
          requests: {
            cpu: "1000m"
            memory: "4Gi"
          }
          limits: {
            cpu: "2000m"
            memory: "8Gi"
          }
        }
        securityContext: {
          runAsNonRoot: true
          runAsUser: 65534
        }
        replicaCount: var.monitoring_config.ha_enabled ? 3 : 1
      }
      alertmanager: {
        enabled: true
        persistence: {
          enabled: true
          size: "50Gi"
        }
        config: {
          global: {
            resolve_timeout: "5m"
          }
          route: {
            receiver: "default-receiver"
            group_wait: "30s"
            group_interval: "5m"
            repeat_interval: "4h"
          }
          receivers: [
            {
              name: "default-receiver"
              email_configs: var.monitoring_config.alert_endpoints
            }
          ]
        }
        replicaCount: var.monitoring_config.ha_enabled ? 3 : 1
      }
      pushgateway: {
        enabled: true
      }
      nodeExporter: {
        enabled: true
      }
      kubeStateMetrics: {
        enabled: true
      }
      networkPolicy: {
        enabled: true
      }
      serviceMonitor: {
        enabled: true
        selector: {
          release: "prometheus"
        }
      }
      prometheusOperator: {
        enabled: true
        prometheusSpec: {
          retention: "${var.monitoring_config.metrics_retention_days}d"
          securityContext: {
            runAsNonRoot: true
            runAsUser: 65534
          }
        }
      }
    })
  ]

  set {
    name  = "server.extraFlags"
    value = "{web.enable-lifecycle,storage.tsdb.retention.time=${var.monitoring_config.metrics_retention_days}d}"
  }
}

# Deploy Grafana with predefined dashboards and security configurations
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = "6.50.0"

  values = [
    yamlencode({
      persistence: {
        enabled: true
        size: "50Gi"
        storageClass: "gp3"
      }
      resources: {
        requests: {
          cpu: "500m"
          memory: "2Gi"
        }
        limits: {
          cpu: "1000m"
          memory: "4Gi"
        }
      }
      securityContext: {
        runAsNonRoot: true
        runAsUser: 472
      }
      replicaCount: var.monitoring_config.ha_enabled ? 2 : 1
      serviceMonitor: {
        enabled: true
      }
      dashboardProviders: {
        dashboardproviders.yaml: {
          apiVersion: 1
          providers: [
            {
              name: "default"
              orgId: 1
              folder: ""
              type: "file"
              disableDeletion: true
              editable: false
              options: {
                path: "/var/lib/grafana/dashboards"
              }
            }
          ]
        }
      }
      dashboards: {
        default: {
          system-metrics: {
            file: "dashboards/system_metrics.json"
            datasource: "Prometheus"
          }
          security-metrics: {
            file: "dashboards/security_metrics.json"
            datasource: "Prometheus"
          }
        }
      }
      datasources: {
        "datasources.yaml": {
          apiVersion: 1
          datasources: [
            {
              name: "Prometheus"
              type: "prometheus"
              url: "http://prometheus-server.monitoring.svc.cluster.local"
              access: "proxy"
              isDefault: true
            }
          ]
        }
      }
      networkPolicy: {
        enabled: true
      }
    })
  ]
}

# Configure AlertManager rules for system and security monitoring
resource "kubernetes_config_map" "alerting_rules" {
  metadata {
    name      = "alerting-rules"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  data = {
    "system_alerts.yml" = yamlencode({
      groups: [
        {
          name: "system_alerts"
          rules: [
            {
              alert: "HighLatency"
              expr: "http_request_duration_seconds{quantile=\"0.95\"} > ${var.monitoring_config.performance_threshold.api_latency_ms / 1000}"
              for: "5m"
              labels: {
                severity: "warning"
              }
              annotations: {
                summary: "High API latency detected"
                description: "95th percentile latency is above threshold"
              }
            },
            {
              alert: "HighCPUUsage"
              expr: "container_cpu_usage_seconds_total > ${var.monitoring_config.performance_threshold.cpu_utilization}"
              for: "10m"
              labels: {
                severity: "warning"
              }
              annotations: {
                summary: "High CPU usage detected"
                description: "CPU usage above threshold for 10 minutes"
              }
            }
          ]
        }
      ]
    })
    
    "security_alerts.yml" = yamlencode({
      groups: [
        {
          name: "security_alerts"
          rules: [
            {
              alert: "HighFailedLogins"
              expr: "rate(auth_failed_logins_total[5m]) > 10"
              for: "5m"
              labels: {
                severity: "critical"
              }
              annotations: {
                summary: "High rate of failed login attempts"
                description: "Unusual number of failed login attempts detected"
              }
            },
            {
              alert: "AbnormalTrafficPattern"
              expr: "rate(http_requests_total[5m]) > 3 * avg_over_time(http_requests_total[1h])"
              for: "5m"
              labels: {
                severity: "warning"
              }
              annotations: {
                summary: "Abnormal traffic pattern detected"
                description: "Request rate significantly above normal levels"
              }
            }
          ]
        }
      ]
    })
  }
}

# Output monitoring endpoints and status
output "prometheus_endpoint" {
  value = {
    url    = "http://prometheus-server.monitoring.svc.cluster.local"
    status = helm_release.prometheus.status
  }
  description = "Prometheus server endpoint and deployment status"
}

output "grafana_endpoint" {
  value = {
    url    = "http://grafana.monitoring.svc.cluster.local"
    status = helm_release.grafana.status
  }
  description = "Grafana dashboard endpoint and deployment status"
}

output "monitoring_status" {
  value = {
    health = {
      prometheus = helm_release.prometheus.status
      grafana    = helm_release.grafana.status
    }
    metrics = {
      retention_days = var.monitoring_config.metrics_retention_days
      ha_enabled    = var.monitoring_config.ha_enabled
    }
  }
  description = "Comprehensive monitoring stack health and configuration status"
}