# Version: 1.0.0
# Provider: hashicorp/aws ~> 5.0
# Purpose: Storage infrastructure for AI-Enhanced Group Chat Platform

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Media Storage Bucket
resource "aws_s3_bucket" "media_bucket" {
  bucket        = "${var.project_name}-${var.environment}-media"
  force_destroy = var.environment != "prod"
  tags          = merge(var.tags, { Type = "media" })
}

resource "aws_s3_bucket_versioning" "media_versioning" {
  bucket = aws_s3_bucket.media_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_encryption" {
  bucket = aws_s3_bucket.media_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media_lifecycle" {
  bucket = aws_s3_bucket.media_bucket.id

  rule {
    id     = "media_retention"
    status = "Enabled"

    transition {
      days          = var.media_retention_days
      storage_class = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Backup Storage Bucket
resource "aws_s3_bucket" "backup_bucket" {
  bucket        = "${var.project_name}-${var.environment}-backups"
  force_destroy = var.environment != "prod"
  tags          = merge(var.tags, { Type = "backup" })
}

resource "aws_s3_bucket_versioning" "backup_versioning" {
  bucket = aws_s3_bucket.backup_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup_encryption" {
  bucket = aws_s3_bucket.backup_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backup_lifecycle" {
  bucket = aws_s3_bucket.backup_bucket.id

  rule {
    id     = "backup_retention"
    status = "Enabled"

    transition {
      days          = var.backup_transition_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = var.backup_retention_days
      storage_class = "GLACIER"
    }

    expiration {
      days = var.backup_retention_days + 90
    }
  }
}

# CDN Configuration for Media Bucket
resource "aws_cloudfront_origin_access_identity" "media_oai" {
  comment = "OAI for ${var.project_name}-${var.environment}-media bucket"
}

resource "aws_cloudfront_distribution" "media_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  default_root_object = "index.html"
  
  origin {
    domain_name = aws_s3_bucket.media_bucket.bucket_regional_domain_name
    origin_id   = aws_s3_bucket.media_bucket.id

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.media_oai.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = aws_s3_bucket.media_bucket.id
    viewer_protocol_policy = "redirect-to-https"
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
    compress    = true
  }

  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.tags, { Service = "cdn" })
}

# Bucket Policies
resource "aws_s3_bucket_policy" "media_bucket_policy" {
  bucket = aws_s3_bucket.media_bucket.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.media_oai.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.media_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_public_access_block" "media_public_access" {
  bucket                  = aws_s3_bucket.media_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "backup_public_access" {
  bucket                  = aws_s3_bucket.backup_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Outputs
output "media_bucket" {
  value = {
    bucket_name = aws_s3_bucket.media_bucket.id
    bucket_arn  = aws_s3_bucket.media_bucket.arn
    cdn_domain  = aws_cloudfront_distribution.media_cdn.domain_name
  }
  description = "Media storage bucket details and CDN domain for content delivery"
}

output "backup_bucket" {
  value = {
    bucket_name = aws_s3_bucket.backup_bucket.id
    bucket_arn  = aws_s3_bucket.backup_bucket.arn
  }
  description = "Backup storage bucket details for backup management"
}