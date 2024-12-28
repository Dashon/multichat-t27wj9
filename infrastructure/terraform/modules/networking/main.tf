# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource configuration
locals {
  # Common tags for all resources
  common_tags = {
    Environment     = var.environment
    Project         = var.project_name
    ManagedBy      = "terraform"
    LastModified   = timestamp()
  }

  # Kubernetes specific tags for subnet discovery
  kubernetes_tags = {
    "kubernetes.io/cluster/${var.project_name}-${var.environment}" = "shared"
    "kubernetes.io/role/elb"                                       = "1"
  }

  # Resource naming prefix
  name_prefix = "${var.project_name}-${var.environment}"

  # VPC Flow logs configuration
  flow_logs_config = {
    traffic_type = "ALL"
    format       = "$${version} $${account-id} $${interface-id} $${srcaddr} $${dstaddr} $${srcport} $${dstport} $${protocol} $${packets} $${bytes} $${start} $${end} $${action} $${log-status}"
  }
}

# Main VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_config.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  count                = var.vpc_config.enable_flow_logs ? 1 : 0
  vpc_id              = aws_vpc.main.id
  traffic_type        = local.flow_logs_config.traffic_type
  log_destination_type = "cloud-watch-logs"
  log_destination     = aws_cloudwatch_log_group.flow_logs[0].arn
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-flow-logs"
  })
}

# CloudWatch Log Group for VPC Flow Logs
resource "aws_cloudwatch_log_group" "flow_logs" {
  count             = var.vpc_config.enable_flow_logs ? 1 : 0
  name              = "/aws/vpc/flow-logs/${local.name_prefix}"
  retention_in_days = 30
  
  tags = local.common_tags
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = length(var.vpc_config.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_config.vpc_cidr, 4, count.index)
  availability_zone       = var.vpc_config.availability_zones[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(local.common_tags, local.kubernetes_tags, {
    Name = "${local.name_prefix}-public-${count.index + 1}"
    Tier = "public"
  })
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = length(var.vpc_config.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_config.vpc_cidr, 4, count.index + length(var.vpc_config.availability_zones))
  availability_zone = var.vpc_config.availability_zones[count.index]
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-${count.index + 1}"
    Tier = "private"
  })
}

# Database Subnets
resource "aws_subnet" "database" {
  count             = length(var.vpc_config.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_config.vpc_cidr, 4, count.index + 2 * length(var.vpc_config.availability_zones))
  availability_zone = var.vpc_config.availability_zones[count.index]
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-database-${count.index + 1}"
    Tier = "database"
  })
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = length(var.vpc_config.availability_zones)
  domain = "vpc"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-eip-${count.index + 1}"
  })
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count         = length(var.vpc_config.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
    Tier = "public"
  })
}

# Private Route Tables
resource "aws_route_table" "private" {
  count  = length(var.vpc_config.availability_zones)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-rt-${count.index + 1}"
    Tier = "private"
  })
}

# Database Route Tables
resource "aws_route_table" "database" {
  count  = length(var.vpc_config.availability_zones)
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-database-rt-${count.index + 1}"
    Tier = "database"
  })
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count          = length(var.vpc_config.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(var.vpc_config.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table_association" "database" {
  count          = length(var.vpc_config.availability_zones)
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database[count.index].id
}

# S3 Bucket for ALB Access Logs
resource "aws_s3_bucket" "lb_logs" {
  bucket = "${local.name_prefix}-alb-logs"
  
  tags = local.common_tags
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [data.aws_security_group.alb.id]
  subnets           = aws_subnet.public[*].id

  enable_deletion_protection = true
  enable_http2             = true

  access_logs {
    bucket  = aws_s3_bucket.lb_logs.id
    prefix  = "alb-logs"
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb"
  })
}

# Outputs
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID"
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "Public subnet IDs"
}

output "private_subnet_ids" {
  value       = aws_subnet.private[*].id
  description = "Private subnet IDs"
}

output "database_subnet_ids" {
  value       = aws_subnet.database[*].id
  description = "Database subnet IDs"
}

output "alb_arn" {
  value       = aws_lb.main.arn
  description = "Application Load Balancer ARN"
}