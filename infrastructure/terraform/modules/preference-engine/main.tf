# Terraform configuration for AI-Enhanced Group Chat Platform Preference Engine
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

# Security group for preference engine service
resource "aws_security_group" "preference_engine" {
  name        = "${var.project_name}-${var.environment}-preference-engine"
  description = "Security group for preference engine service"
  vpc_id      = data.terraform_remote_state.networking.outputs.vpc_id

  ingress {
    description     = "Allow inbound traffic from API service"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [var.api_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-preference-engine"
  })
}

# ECS Task Definition for preference engine service
resource "aws_ecs_task_definition" "preference_engine" {
  family                   = "${var.project_name}-${var.environment}-preference-engine"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.environment == "prod" ? 1024 : 512
  memory                  = var.environment == "prod" ? 2048 : 1024
  execution_role_arn      = aws_iam_role.ecs_execution_role.arn
  task_role_arn          = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "preference-engine"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8000
          protocol     = "tcp"
        }
      ]

      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        },
        {
          name  = "POSTGRES_HOST"
          value = data.terraform_remote_state.database.outputs.postgresql_config.endpoint
        },
        {
          name  = "REDIS_HOST"
          value = data.terraform_remote_state.database.outputs.redis_config.primary_endpoint
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.project_name}-${var.environment}/preference-engine"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = var.tags
}

# ECS Service for preference engine
resource "aws_ecs_service" "preference_engine" {
  name                = "${var.project_name}-${var.environment}-preference-engine"
  cluster             = var.ecs_cluster_id
  task_definition     = aws_ecs_task_definition.preference_engine.arn
  desired_count       = var.environment == "prod" ? 3 : 1
  launch_type         = "FARGATE"
  platform_version    = "LATEST"
  propagate_tags      = "SERVICE"

  network_configuration {
    subnets          = data.terraform_remote_state.networking.outputs.private_subnet_ids
    security_groups  = [aws_security_group.preference_engine.id]
    assign_public_ip = false
  }

  deployment_configuration {
    maximum_percent        = 200
    minimum_healthy_percent = 100
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }

  service_registries {
    registry_arn = aws_service_discovery_service.preference_engine.arn
  }

  tags = var.tags
}

# Auto Scaling configuration
resource "aws_appautoscaling_target" "preference_engine" {
  max_capacity       = var.environment == "prod" ? 10 : 3
  min_capacity       = var.environment == "prod" ? 3 : 1
  resource_id        = "service/${var.ecs_cluster_name}/${aws_ecs_service.preference_engine.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "preference_engine_cpu" {
  name               = "${var.project_name}-${var.environment}-preference-engine-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.preference_engine.resource_id
  scalable_dimension = aws_appautoscaling_target.preference_engine.scalable_dimension
  service_namespace  = aws_appautoscaling_target.preference_engine.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

resource "aws_appautoscaling_policy" "preference_engine_memory" {
  name               = "${var.project_name}-${var.environment}-preference-engine-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.preference_engine.resource_id
  scalable_dimension = aws_appautoscaling_target.preference_engine.scalable_dimension
  service_namespace  = aws_appautoscaling_target.preference_engine.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = 80.0
  }
}

# Service Discovery
resource "aws_service_discovery_service" "preference_engine" {
  name = "${var.project_name}-${var.environment}-preference-engine"

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

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "preference_engine" {
  name              = "/ecs/${var.project_name}-${var.environment}/preference-engine"
  retention_in_days = var.environment == "prod" ? 30 : 7
  tags              = var.tags
}

# Outputs
output "service_name" {
  description = "Name of the ECS service for preference engine"
  value       = aws_ecs_service.preference_engine.name
}

output "task_definition_arn" {
  description = "ARN of the task definition for preference engine"
  value       = aws_ecs_task_definition.preference_engine.arn
}

output "security_group_id" {
  description = "ID of the security group for preference engine"
  value       = aws_security_group.preference_engine.id
}