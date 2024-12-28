# Provider versions:
# aws: ~> 5.0
# kubernetes: ~> 2.23

terraform {
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
}

# Local variables
locals {
  service_name    = "${var.environment}-${var.project_name}-ai-service"
  node_group_name = "${var.environment}-${var.project_name}-ai-node-group"
}

# Variables
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "ecr_repository_url" {
  type        = string
  description = "ECR repository URL for AI service container images"
}

variable "image_tag" {
  type        = string
  description = "Container image tag to deploy"
}

# Data sources
data "aws_eks_cluster" "main" {
  name = "${var.project_name}-${var.environment}"
}

data "aws_subnet_ids" "private" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    Tier = "private"
  }
}

data "aws_vpc" "main" {
  tags = {
    Name = "${var.project_name}-${var.environment}"
  }
}

# IAM role for AI service node group
resource "aws_iam_role" "ai_node_role" {
  name = "${local.node_group_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Attach required policies
resource "aws_iam_role_policy_attachment" "ai_node_policy" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  ])

  policy_arn = each.value
  role       = aws_iam_role.ai_node_role.name
}

# EKS node group for AI service with GPU support
resource "aws_eks_node_group" "ai_service" {
  cluster_name    = data.aws_eks_cluster.main.name
  node_group_name = local.node_group_name
  node_role_arn   = aws_iam_role.ai_node_role.arn
  subnet_ids      = data.aws_subnet_ids.private.ids

  instance_types = ["g4dn.xlarge"]  # GPU-enabled instance type

  scaling_config {
    desired_size = 2
    max_size     = 8
    min_size     = 1
  }

  labels = {
    service = "ai"
    gpu     = "true"
  }

  # GPU-specific taints
  taint {
    key    = "nvidia.com/gpu"
    value  = "true"
    effect = "NO_SCHEDULE"
  }

  tags = {
    Name        = local.node_group_name
    Environment = var.environment
    Service     = "ai"
  }
}

# Kubernetes deployment for AI service
resource "kubernetes_deployment" "ai_service" {
  metadata {
    name      = local.service_name
    namespace = var.environment
    labels = {
      app = "ai-service"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "ai-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "ai-service"
        }
      }

      spec {
        node_selector = {
          service = "ai"
          gpu     = "true"
        }

        container {
          name  = "ai-service"
          image = "${var.ecr_repository_url}:${var.image_tag}"

          resources {
            limits = {
              "nvidia.com/gpu" = 1
              memory          = "8Gi"
              cpu            = "4"
            }
            requests = {
              memory = "4Gi"
              cpu    = "2"
            }
          }

          env {
            name  = "ENVIRONMENT"
            value = var.environment
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 30
            period_seconds       = 10
          }

          readiness_probe {
            http_get {
              path = "/ready"
              port = 8080
            }
            initial_delay_seconds = 5
            period_seconds       = 5
          }
        }

        # Add NVIDIA device plugin toleration
        toleration {
          key      = "nvidia.com/gpu"
          operator = "Exists"
          effect   = "NoSchedule"
        }
      }
    }
  }
}

# Horizontal Pod Autoscaler for AI service
resource "kubernetes_horizontal_pod_autoscaler" "ai_service" {
  metadata {
    name      = "${local.service_name}-hpa"
    namespace = var.environment
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.ai_service.metadata[0].name
    }

    min_replicas = 2
    max_replicas = 8

    metric {
      type = "Resource"
      resource {
        name = "nvidia.com/gpu"
        target {
          type                = "Utilization"
          average_utilization = 60
        }
      }
    }
  }
}

# Service for AI deployment
resource "kubernetes_service" "ai_service" {
  metadata {
    name      = local.service_name
    namespace = var.environment
  }

  spec {
    selector = {
      app = "ai-service"
    }

    port {
      port        = 8080
      target_port = 8080
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# Output the service endpoint
output "ai_service_endpoint" {
  description = "AI service endpoint URL"
  value       = kubernetes_service.ai_service.metadata[0].name
}