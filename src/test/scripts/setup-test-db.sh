#!/bin/bash

# =============================================================================
# Test Database Setup Script for AI-Enhanced Group Chat Platform
# Version: 1.0.0
# Description: Initializes and configures test databases with enhanced security,
#              validation, and automated setup procedures
# =============================================================================

set -euo pipefail

# Script initialization and environment setup
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../../" && pwd)
ENV_FILE="$PROJECT_ROOT/test/.env.test"
TIMEOUT_SECONDS=300
LOG_FILE="$PROJECT_ROOT/logs/test-db-setup.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

# =============================================================================
# Validation Functions
# =============================================================================

validate_environment() {
    local required_vars=(
        "TEST_MONGODB_URI"
        "TEST_POSTGRES_URI"
        "TEST_REDIS_URI"
        "TEST_DB_CLEANUP_ENABLED"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set"
            return 1
        fi
    done
}

check_dependencies() {
    local dependencies=(
        "psql"
        "mongosh"
        "redis-cli"
    )

    for cmd in "${dependencies[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required dependency $cmd is not installed"
            return 1
        fi
    done
}

# =============================================================================
# PostgreSQL Setup Functions
# =============================================================================

setup_postgres() {
    log "Setting up PostgreSQL test database..."
    
    # Extract connection details from URI
    local db_name="test_user_db"
    
    # Terminate existing connections
    psql "${TEST_POSTGRES_URI}" -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${db_name}'
        AND pid <> pg_backend_pid();" &>/dev/null || true

    # Drop and recreate database
    psql "${TEST_POSTGRES_URI}" -c "DROP DATABASE IF EXISTS ${db_name};" || true
    psql "${TEST_POSTGRES_URI}" -c "CREATE DATABASE ${db_name} WITH ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8';"

    # Connect to the new database and set up schema
    psql "${TEST_POSTGRES_URI}/${db_name}" << EOF
        -- Enable required extensions
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";

        -- Create schemas
        CREATE SCHEMA IF NOT EXISTS user_service;
        CREATE SCHEMA IF NOT EXISTS chat_service;
        CREATE SCHEMA IF NOT EXISTS ai_service;

        -- Set up user tables
        CREATE TABLE user_service.users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(50) UNIQUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX idx_users_email ON user_service.users(email);
        CREATE INDEX idx_users_username ON user_service.users(username);

        -- Set up test data
        INSERT INTO user_service.users (email, username)
        VALUES 
            ('test1@example.com', 'testuser1'),
            ('test2@example.com', 'testuser2');

        -- Analyze for query optimization
        ANALYZE user_service.users;
EOF

    log "PostgreSQL setup completed successfully"
}

# =============================================================================
# MongoDB Setup Functions
# =============================================================================

setup_mongodb() {
    log "Setting up MongoDB test database..."
    
    mongosh "${TEST_MONGODB_URI}" --eval "
        // Drop existing database
        db.dropDatabase();

        // Create collections with validation
        db.createCollection('messages', {
            validator: {
                \$jsonSchema: {
                    bsonType: 'object',
                    required: ['chat_id', 'sender_id', 'content', 'created_at'],
                    properties: {
                        chat_id: { bsonType: 'string' },
                        sender_id: { bsonType: 'string' },
                        content: { bsonType: 'string' },
                        created_at: { bsonType: 'date' }
                    }
                }
            }
        });

        // Create indexes
        db.messages.createIndex({ chat_id: 1, created_at: -1 });
        db.messages.createIndex({ sender_id: 1 });
        db.messages.createIndex({ content: 'text' });

        // Insert test data
        db.messages.insertMany([
            {
                chat_id: 'test-chat-1',
                sender_id: 'test-user-1',
                content: 'Test message 1',
                created_at: new Date()
            },
            {
                chat_id: 'test-chat-1',
                sender_id: 'test-user-2',
                content: 'Test message 2',
                created_at: new Date()
            }
        ]);
    "

    log "MongoDB setup completed successfully"
}

# =============================================================================
# Redis Setup Functions
# =============================================================================

setup_redis() {
    log "Setting up Redis test instance..."
    
    # Clear existing data
    redis-cli -u "${TEST_REDIS_URI}" FLUSHDB

    # Set up test data and configurations
    redis-cli -u "${TEST_REDIS_URI}" << EOF
        # Set test configurations
        CONFIG SET maxmemory 100mb
        CONFIG SET maxmemory-policy allkeys-lru

        # Set up test data
        HSET test:user:1 username "testuser1" email "test1@example.com"
        HSET test:user:2 username "testuser2" email "test2@example.com"

        # Set up rate limiting keys
        SET test:ratelimit:api:1 "0" EX 3600
EOF

    log "Redis setup completed successfully"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log "Starting test database setup..."

    # Load environment variables
    if [[ -f "$ENV_FILE" ]]; then
        source "$ENV_FILE"
    else
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi

    # Validate environment and dependencies
    validate_environment || exit 1
    check_dependencies || exit 1

    # Set up trap for cleanup
    trap 'log_error "Script interrupted"; exit 1' INT TERM

    # Execute setup functions with timeout
    timeout "$TIMEOUT_SECONDS" setup_postgres || { log_error "PostgreSQL setup failed"; exit 1; }
    timeout "$TIMEOUT_SECONDS" setup_mongodb || { log_error "MongoDB setup failed"; exit 1; }
    timeout "$TIMEOUT_SECONDS" setup_redis || { log_error "Redis setup failed"; exit 1; }

    log "Test database setup completed successfully"
}

# Execute main function
main