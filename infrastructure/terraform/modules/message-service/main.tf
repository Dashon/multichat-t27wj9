# Message Service Infrastructure Module
# Version: 1.0.0
# Provider: hashicorp/aws ~> 5.0

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Service     = var.service_name
    ManagedBy   = "Terraform"
  }
}

# ECS Task Definition for Message Service
resource "aws_ecs_task_definition" "message" {
  family                   = "${local.name_prefix}-${var.service_name}"
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = var.service_name
      image = "${aws_ecr_repository.message.repository_url}:latest"
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "MONGODB_URI"
          value = data.aws_secretsmanager_secret_version.mongodb.secret_string
        },
        {
          name  = "REDIS_URL"
          value = data.aws_secretsmanager_secret_version.redis.secret_string
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}${var.health_check_path} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.message.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.service_name
        }
      }
    }
  ])

  tags = local.common_tags
}

# ECS Service
resource "aws_ecs_service" "message" {
  name                               = "${local.name_prefix}-${var.service_name}"
  cluster                           = var.ecs_cluster_id
  task_definition                   = aws_ecs_task_definition.message.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.message.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  service_registries {
    registry_arn = aws_service_discovery_service.message.arn
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.message.arn
    container_name   = var.service_name
    container_port   = var.container_port
  }

  tags = local.common_tags
}

# Security Group
resource "aws_security_group" "message" {
  name        = "${local.name_prefix}-${var.service_name}-sg"
  description = "Security group for message service with WebSocket support"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  ingress {
    description     = "HTTPS"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  ingress {
    description     = "WebSocket"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Auto Scaling
resource "aws_appautoscaling_target" "message" {
  max_capacity       = 15
  min_capacity       = 3
  resource_id        = "service/${var.ecs_cluster_name}/${aws_ecs_service.message.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based Auto Scaling
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-${var.service_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.message.resource_id
  scalable_dimension = aws_appautoscaling_target.message.scalable_dimension
  service_namespace  = aws_appautoscaling_target.message.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70
  }
}

# Memory-based Auto Scaling
resource "aws_appautoscaling_policy" "memory" {
  name               = "${local.name_prefix}-${var.service_name}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.message.resource_id
  scalable_dimension = aws_appautoscaling_target.message.scalable_dimension
  service_namespace  = aws_appautoscaling_target.message.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = 80
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "message" {
  name              = "/ecs/${local.name_prefix}-${var.service_name}"
  retention_in_days = 30
  kms_key_id        = var.log_encryption_key_arn

  tags = local.common_tags
}

# Service Discovery
resource "aws_service_discovery_service" "message" {
  name = var.service_name

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
}

# Application Load Balancer Target Group
resource "aws_lb_target_group" "message" {
  name                 = "${local.name_prefix}-${var.service_name}-tg"
  port                 = var.container_port
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = var.health_check_path
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = local.common_tags
}

# Outputs
output "service_name" {
  description = "Name of the deployed ECS service"
  value       = aws_ecs_service.message.name
}

output "security_group_id" {
  description = "Security group ID of the message service"
  value       = aws_security_group.message.id
}

output "task_definition_arn" {
  description = "ARN of the task definition"
  value       = aws_ecs_task_definition.message.arn
}

output "service_discovery_arn" {
  description = "ARN of the service discovery entry"
  value       = aws_service_discovery_service.message.arn
}