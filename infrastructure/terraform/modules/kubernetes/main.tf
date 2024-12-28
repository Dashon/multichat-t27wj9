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

# Configure providers
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = var.tags
  }
}

# Data source for EKS cluster authentication
data "aws_eks_cluster_auth" "main" {
  name = aws_eks_cluster.main.name
}

provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.main.token
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", aws_eks_cluster.main.name]
  }
}

# KMS key for EKS secrets encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-eks-key"
  })
}

# IAM role for EKS cluster
resource "aws_iam_role" "eks_cluster" {
  name = "${var.project_name}-${var.environment}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

# Attach required policies to cluster role
resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

# IAM role for node groups
resource "aws_iam_role" "eks_node_group" {
  name = "${var.project_name}-${var.environment}-eks-node-group"

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

# Attach required policies to node group role
resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "eks_container_registry" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_group.name
}

# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = "${var.project_name}-${var.environment}"
  version  = var.kubernetes_config.cluster_version
  role_arn = aws_iam_role.eks_cluster.arn

  vpc_config {
    subnet_ids              = var.vpc_config.private_subnets
    endpoint_private_access = true
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.eks_cluster.id]
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-eks"
  })
}

# Node group for API services
resource "aws_eks_node_group" "api" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-${var.environment}-api"
  node_role_arn   = aws_iam_role.eks_node_group.arn
  subnet_ids      = var.vpc_config.private_subnets

  instance_types = [var.kubernetes_config.node_instance_types.api]
  
  scaling_config {
    desired_size = var.kubernetes_config.desired_nodes.api
    min_size     = var.kubernetes_config.min_nodes.api
    max_size     = var.kubernetes_config.max_nodes.api
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-api-nodes"
  })
}

# Node group for Message services
resource "aws_eks_node_group" "message" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-${var.environment}-message"
  node_role_arn   = aws_iam_role.eks_node_group.arn
  subnet_ids      = var.vpc_config.private_subnets

  instance_types = [var.kubernetes_config.node_instance_types.message]
  
  scaling_config {
    desired_size = var.kubernetes_config.desired_nodes.message
    min_size     = var.kubernetes_config.min_nodes.message
    max_size     = var.kubernetes_config.max_nodes.message
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-message-nodes"
  })
}

# Node group for AI services with GPU support
resource "aws_eks_node_group" "ai" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-${var.environment}-ai"
  node_role_arn   = aws_iam_role.eks_node_group.arn
  subnet_ids      = var.vpc_config.private_subnets

  instance_types = [var.kubernetes_config.node_instance_types.ai]
  
  scaling_config {
    desired_size = var.kubernetes_config.desired_nodes.ai
    min_size     = var.kubernetes_config.min_nodes.ai
    max_size     = var.kubernetes_config.max_nodes.ai
  }

  # GPU-specific taints
  taint {
    key    = "nvidia.com/gpu"
    value  = "true"
    effect = "NO_SCHEDULE"
  }

  labels = {
    "nvidia.com/gpu" = "true"
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ai-nodes"
  })
}

# Security group for EKS cluster
resource "aws_security_group" "eks_cluster" {
  name        = "${var.project_name}-${var.environment}-eks-cluster"
  description = "Security group for EKS cluster"
  vpc_id      = var.vpc_config.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-eks-cluster-sg"
  })
}

# Outputs
output "cluster_endpoint" {
  description = "EKS cluster endpoint URL"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "cluster_auth_token" {
  description = "Authentication token for cluster access"
  value       = data.aws_eks_cluster_auth.main.token
  sensitive   = true
}