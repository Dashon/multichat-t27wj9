# AWS Provider configuration with version constraint ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for enhanced security configurations
locals {
  common_tags = {
    Environment   = var.environment
    Project       = var.project_name
    ManagedBy    = "terraform"
    LastModified = timestamp()
    SecurityTier = "high"
  }

  name_prefix = "${var.project_name}-${var.environment}"

  # WAF rule configurations with AI-specific protections
  waf_rules = {
    rate_limit = {
      name     = "RateLimit"
      priority = 1
      limit    = lookup(var.waf_rate_limit, var.environment, 1000)
    }
    ai_threat_patterns = {
      name     = "AIThreatDetection"
      priority = 2
      patterns = ["prompt-injection", "model-manipulation", "context-poisoning"]
    }
  }

  # Security group rule sets for AI services
  ai_security_rules = {
    ingress = [
      {
        from_port   = 443
        to_port     = 443
        protocol    = "tcp"
        description = "HTTPS for AI service communication"
      },
      {
        from_port   = 8080
        to_port     = 8080
        protocol    = "tcp"
        description = "AI model serving port"
      }
    ]
    egress = [
      {
        from_port   = 0
        to_port     = 0
        protocol    = "-1"
        cidr_blocks = ["0.0.0.0/0"]
        description = "Allow all outbound traffic"
      }
    ]
  }
}

# WAF Web ACL with enhanced AI protection
resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name_prefix}-waf"
  description = "WAF rules for AI-Enhanced Chat Platform"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rate limiting rule
  rule {
    name     = local.waf_rules.rate_limit.name
    priority = local.waf_rules.rate_limit.priority

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = local.waf_rules.rate_limit.limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.name_prefix}-rate-limit"
      sampled_requests_enabled  = true
    }
  }

  # AI-specific threat detection rule
  rule {
    name     = local.waf_rules.ai_threat_patterns.name
    priority = local.waf_rules.ai_threat_patterns.priority

    override_action {
      none {}
    }

    statement {
      regex_pattern_set_reference_statement {
        arn = aws_wafv2_regex_pattern_set.ai_threats.arn
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 1
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.name_prefix}-ai-threats"
      sampled_requests_enabled  = true
    }
  }

  tags = local.common_tags
}

# KMS key for data encryption
resource "aws_kms_key" "main" {
  description             = "Multi-region encryption key for AI-Enhanced Chat Platform"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  multi_region           = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow AI Service Access"
        Effect = "Allow"
        Principal = {
          Service = "ai-services.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

# Security group for AI services
resource "aws_security_group" "ai_services" {
  name        = "${local.name_prefix}-ai-services-sg"
  description = "Security group for AI services"
  vpc_id      = data.aws_vpc.main.id

  dynamic "ingress" {
    for_each = local.ai_security_rules.ingress
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = [data.aws_vpc.main.cidr_block]
      description = ingress.value.description
    }
  }

  dynamic "egress" {
    for_each = local.ai_security_rules.egress
    content {
      from_port   = egress.value.from_port
      to_port     = egress.value.to_port
      protocol    = egress.value.protocol
      cidr_blocks = egress.value.cidr_blocks
      description = egress.value.description
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ai-services-sg"
  })
}

# IAM role for AI services
resource "aws_iam_role" "ai_service" {
  name = "${local.name_prefix}-ai-service-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ai-services.amazonaws.com"
        }
      }
    ]
  })

  inline_policy {
    name = "ai-service-permissions"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "kms:Decrypt",
            "kms:GenerateDataKey",
            "s3:GetObject",
            "s3:PutObject",
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ]
          Resource = [
            aws_kms_key.main.arn,
            "arn:aws:s3:::${local.name_prefix}-*",
            "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:*"
          ]
        }
      ]
    })
  }

  tags = local.common_tags
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Data source for VPC
data "aws_vpc" "main" {
  id = var.vpc_id
}

# Outputs
output "waf_web_acl_arn" {
  value       = aws_wafv2_web_acl.main.arn
  description = "WAF Web ACL ARN"
}

output "kms_key_arn" {
  value       = aws_kms_key.main.arn
  description = "KMS key ARN for data encryption"
}

output "ai_security_group_id" {
  value       = aws_security_group.ai_services.id
  description = "Security group ID for AI services"
}

output "ai_service_role_arn" {
  value       = aws_iam_role.ai_service.arn
  description = "IAM role ARN for AI services"
}