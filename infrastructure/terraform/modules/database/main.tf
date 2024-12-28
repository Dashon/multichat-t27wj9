# Database Infrastructure Module
# Version: 1.0.0
# Provider versions:
# - hashicorp/aws ~> 5.0
# - mongodb/mongodbatlas ~> 1.12

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.12"
    }
  }
}

# PostgreSQL Database Resources
resource "aws_db_subnet_group" "postgresql" {
  name        = "${var.project_name}-${var.environment}-postgresql"
  description = "Subnet group for PostgreSQL database"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgresql-subnet-group"
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "postgresql" {
  family = "postgres14"
  name   = "${var.project_name}-${var.environment}-postgresql"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }
}

resource "aws_db_instance" "postgresql" {
  identifier     = "${var.project_name}-${var.environment}-postgresql"
  engine         = "postgres"
  engine_version = "14"

  instance_class    = var.database_config.postgresql_instance
  allocated_storage = 100
  storage_type      = "gp3"
  storage_encrypted = var.database_config.storage_encrypted
  kms_key_id       = var.kms_key_id

  multi_az               = var.database_config.multi_az
  db_subnet_group_name   = aws_db_subnet_group.postgresql.name
  vpc_security_group_ids = [var.database_security_group_id]
  parameter_group_name   = aws_db_parameter_group.postgresql.name

  backup_retention_period = var.database_config.backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  performance_insights_enabled    = var.database_config.performance_insights_enabled
  performance_insights_retention_period = 7
  monitoring_interval            = 60
  monitoring_role_arn           = aws_iam_role.rds_monitoring.arn

  deletion_protection = var.database_config.deletion_protection
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-postgresql-final"

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgresql"
    Environment = var.environment
  }
}

# MongoDB Atlas Cluster
resource "mongodbatlas_cluster" "main" {
  project_id = var.mongodb_project_id
  name       = "${var.project_name}-${var.environment}"

  provider_name               = "AWS"
  provider_region_name       = var.aws_region.primary
  provider_instance_size_name = var.database_config.mongodb_instance

  cluster_type = "REPLICASET"
  mongo_db_major_version = "6.0"

  auto_scaling_disk_gb_enabled = true
  encryption_at_rest_provider = "AWS"

  backup_enabled        = true
  pit_enabled          = true
  retention_in_days    = var.database_config.backup_retention_days

  replication_specs {
    num_shards = 1
    regions_config {
      region_name     = var.aws_region.primary
      electable_nodes = var.database_config.replica_count
      priority        = 7
      read_only_nodes = 0
    }
  }
}

# Redis Cluster
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis"
  description = "Subnet group for Redis cluster"
  subnet_ids  = var.private_subnet_ids
}

resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "${var.project_name}-${var.environment}-redis"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description         = "Redis cluster for real-time caching"

  node_type             = var.database_config.redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.redis.name

  automatic_failover_enabled = true
  multi_az_enabled         = var.database_config.multi_az
  num_cache_clusters       = var.database_config.replica_count

  at_rest_encryption_enabled = var.database_config.storage_encrypted
  transit_encryption_enabled = true

  security_group_ids = [var.database_security_group_id]
  
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_window           = "04:00-05:00"
  snapshot_retention_limit  = var.database_config.backup_retention_days

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis"
    Environment = var.environment
  }
}

# Milvus Vector Database (ECS Service)
resource "aws_ecs_task_definition" "milvus" {
  family                   = "${var.project_name}-${var.environment}-milvus"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = 2048
  memory                  = 4096
  execution_role_arn      = aws_iam_role.milvus_execution.arn
  task_role_arn          = aws_iam_role.milvus_task.arn

  container_definitions = jsonencode([
    {
      name  = "milvus"
      image = "milvusdb/milvus:v2.2.11"
      portMappings = [
        {
          containerPort = 19530
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "ETCD_ENDPOINTS"
          value = "etcd:2379"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.project_name}-${var.environment}/milvus"
          awslogs-region        = var.aws_region.primary
          awslogs-stream-prefix = "milvus"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "milvus" {
  name            = "${var.project_name}-${var.environment}-milvus"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.milvus.arn
  desired_count   = var.environment == "prod" ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.database_security_group_id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.milvus.arn
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-milvus"
    Environment = var.environment
  }
}

# Outputs
output "postgresql_config" {
  description = "PostgreSQL connection details"
  value = {
    endpoint       = aws_db_instance.postgresql.endpoint
    port          = aws_db_instance.postgresql.port
    database_name = aws_db_instance.postgresql.db_name
  }
}

output "mongodb_config" {
  description = "MongoDB connection details"
  value = {
    connection_string = mongodbatlas_cluster.main.connection_strings[0].standard
    cluster_id       = mongodbatlas_cluster.main.cluster_id
    srv_address      = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  }
  sensitive = true
}

output "redis_config" {
  description = "Redis connection details"
  value = {
    primary_endpoint = aws_elasticache_replication_group.redis.primary_endpoint_address
    reader_endpoint  = aws_elasticache_replication_group.redis.reader_endpoint_address
    port            = aws_elasticache_replication_group.redis.port
  }
}

output "milvus_config" {
  description = "Milvus connection details"
  value = {
    endpoint     = aws_service_discovery_service.milvus.name
    port        = 19530
    service_name = aws_ecs_service.milvus.name
  }
}