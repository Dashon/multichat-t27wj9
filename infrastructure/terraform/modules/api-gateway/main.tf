# API Gateway Infrastructure Module
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
}

# Primary API Gateway
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-${var.environment}"
  description = "Enhanced API Gateway for AI-Enhanced Group Chat Platform"

  endpoint_configuration {
    types             = ["REGIONAL"]
    vpc_endpoint_ids  = [aws_vpc_endpoint.api_gateway.id]
  }

  minimum_compression_size = 10240
  binary_media_types      = ["application/json", "application/xml"]

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
    DR-Region   = var.aws_region.secondary
  }
}

# Enhanced JWT Authorizer
resource "aws_api_gateway_authorizer" "jwt_auth" {
  name                             = "jwt-auth"
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  type                            = "JWT"
  identity_source                 = "$request.header.Authorization"
  authorizer_result_ttl_in_seconds = 300
  authorizer_credentials           = aws_iam_role.authorizer.arn
}

# WAF Web ACL with enhanced security rules
resource "aws_wafv2_web_acl" "api_gateway" {
  name        = "${var.project_name}-${var.environment}-waf"
  description = "WAF rules for API Gateway protection"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rate-based rule for DDoS protection
  rule {
    name     = "rate-limiting"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateLimitMetric"
      sampled_requests_enabled  = true
    }
  }

  # SQL injection protection
  rule {
    name     = "sql-injection-protection"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "SQLiProtectionMetric"
      sampled_requests_enabled  = true
    }
  }

  # XSS protection
  rule {
    name     = "xss-protection"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "XSSProtectionMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "APIGatewayWAFMetrics"
    sampled_requests_enabled  = true
  }
}

# Enhanced API Gateway Stage with monitoring
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id  = aws_api_gateway_rest_api.main.id
  stage_name   = var.environment

  cache_cluster_enabled = true
  cache_cluster_size   = "0.5"
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId       = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      caller         = "$context.identity.caller"
      user           = "$context.identity.user"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      userAgent     = "$context.identity.userAgent"
      apiKey        = "$context.identity.apiKey"
    })
  }

  variables = {
    loggingLevel     = "INFO"
    dataTraceEnabled = "true"
    metricsEnabled   = "true"
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 30

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

# VPC Endpoint for API Gateway
resource "aws_vpc_endpoint" "api_gateway" {
  vpc_id             = var.vpc_config.vpc_id
  service_name       = "com.amazonaws.${var.aws_region.primary}.execute-api"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = var.vpc_config.private_subnets
  security_group_ids = [aws_security_group.api_gateway_endpoint.id]

  private_dns_enabled = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

# Security Group for API Gateway VPC Endpoint
resource "aws_security_group" "api_gateway_endpoint" {
  name_prefix = "${var.project_name}-api-gateway-endpoint-"
  vpc_id      = var.vpc_config.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.vpc_config.private_subnets_cidr
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

# Outputs
output "api_gateway_endpoint" {
  description = "API Gateway endpoints"
  value = {
    endpoint_url          = aws_api_gateway_stage.main.invoke_url
    failover_endpoint_url = "https://${aws_api_gateway_rest_api.main.id}-${var.aws_region.secondary}.execute-api.${var.aws_region.secondary}.amazonaws.com/${var.environment}"
  }
}

output "api_gateway_id" {
  description = "API Gateway and WAF ACL IDs"
  value = {
    gateway_id  = aws_api_gateway_rest_api.main.id
    waf_acl_id  = aws_wafv2_web_acl.api_gateway.id
  }
}