# User Service Infrastructure Module
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

# Local variables for resource naming and tagging
locals {
  service_name = "${var.project_name}-${var.environment}-user-service"
  common_tags = merge(var.tags, {
    Service     = "user-service"
    Environment = var.environment
  })
}

# ECS Task Definition for User Service
resource "aws_ecs_task_definition" "user_service" {
  family                   = local.service_name
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = 1024  # 1 vCPU
  memory                  = 2048  # 2GB RAM
  execution_role_arn      = aws_iam_role.ecs_execution_role.arn
  task_role_arn          = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name  = "user-service"
    image = "${var.ecr_repository_url}:${var.image_tag}"
    essential = true
    
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    environment = [
      {
        name  = "NODE_ENV"
        value = var.environment
      },
      {
        name  = "DB_HOST"
        value = var.database_endpoint
      },
      {
        name  = "AWS_REGION"
        value = var.aws_region.primary
      }
    ]

    secrets = [
      {
        name      = "DB_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.db_password.arn}"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${local.service_name}"
        "awslogs-region"        = var.aws_region.primary
        "awslogs-stream-prefix" = "ecs"
        "awslogs-create-group"  = "true"
      }
    }
  }])

  tags = local.common_tags
}

# ECS Service
resource "aws_ecs_service" "user_service" {
  name                               = local.service_name
  cluster                           = var.ecs_cluster_id
  task_definition                   = aws_ecs_task_definition.user_service.arn
  desired_count                     = 2
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent        = 200
  health_check_grace_period_seconds = 60
  enable_execute_command            = true

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.user_service.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.user_service.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.common_tags
}

# Auto Scaling Configuration
resource "aws_appautoscaling_target" "user_service" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${var.ecs_cluster_name}/${aws_ecs_service.user_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu_scaling" {
  name               = "${local.service_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.user_service.resource_id
  scalable_dimension = aws_appautoscaling_target.user_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.user_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Security Group
resource "aws_security_group" "user_service" {
  name_prefix = "${local.service_name}-sg"
  vpc_id      = var.vpc_id
  description = "Security group for user service"

  ingress {
    description     = "Service port"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = var.alb_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Service Discovery
resource "aws_service_discovery_service" "user_service" {
  name = "user-service"

  dns_config {
    namespace_id = var.service_discovery_namespace_id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.common_tags
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "user_service" {
  name              = "/ecs/${local.service_name}"
  retention_in_days = 30
  tags             = local.common_tags
}

# Outputs
output "user_service_config" {
  description = "User service configuration details"
  value = {
    service_name         = aws_ecs_service.user_service.name
    task_definition_arn = aws_ecs_task_definition.user_service.arn
    service_url         = "http://${aws_service_discovery_service.user_service.name}.${var.service_discovery_namespace_name}"
    security_group_id   = aws_security_group.user_service.id
    log_group_name      = aws_cloudwatch_log_group.user_service.name
  }
}