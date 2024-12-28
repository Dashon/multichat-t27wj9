#!/bin/bash

# Enhanced test data cleanup script for AI-Enhanced Group Chat Platform
# Version: 1.0.0
# Handles cleanup of test data across MongoDB, PostgreSQL, Redis and Vector stores
# with transaction safety and verification

# Enable strict error handling
set -euo pipefail

# Script constants
readonly SCRIPT_DIR="$(dirname "$0")"
readonly LOG_FILE="./cleanup.log"
readonly CLEANUP_TIMEOUT=300
readonly VERIFICATION_RETRIES=3
readonly MIN_WAIT_TIME=2
readonly MAX_RETRIES=3

# Ensure we're in test environment
if [[ "${NODE_ENV:-}" != "test" ]]; then
    echo "Error: This script must be run in test environment"
    exit 1
fi

# Configure logging
exec 1> >(tee -a "$LOG_FILE") 2>&1

# Timestamp function for logging
timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

# Log function with severity levels
log() {
    local level=$1
    shift
    echo "[$(timestamp)] [$level] $*"
}

# Error handling function
cleanup_on_error() {
    local exit_code=$?
    log "ERROR" "Script failed with exit code: $exit_code"
    log "ERROR" "Initiating rollback procedures..."
    
    # Attempt to restore database state if backup exists
    if [[ -f "${SCRIPT_DIR}/backup/pre_cleanup_state.json" ]]; then
        log "INFO" "Restoring from backup..."
        restore_from_backup || log "ERROR" "Restore failed"
    fi
    
    exit $exit_code
}

# Set up error trap
trap cleanup_on_error ERR INT TERM

# Function to check environment setup
check_environment() {
    log "INFO" "Checking environment setup..."
    
    # Validate required environment variables
    local required_vars=(
        "DB_HOST"
        "DB_PORT"
        "DB_NAME"
        "REDIS_URL"
        "VECTOR_DB_URL"
        "TEST_ENV"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log "ERROR" "Required environment variable $var is not set"
            return 1
        fi
    done
    
    # Verify database connection permissions
    if ! verify_db_permissions; then
        log "ERROR" "Insufficient database permissions"
        return 1
    fi
    
    log "INFO" "Environment check completed successfully"
    return 0
}

# Function to verify database permissions
verify_db_permissions() {
    local has_permissions=true
    
    # Check MongoDB permissions
    if ! mongo --eval "db.getUsers()" "$DB_NAME" &>/dev/null; then
        log "ERROR" "Missing required MongoDB permissions"
        has_permissions=false
    fi
    
    # Check PostgreSQL permissions
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "\du" &>/dev/null; then
        log "ERROR" "Missing required PostgreSQL permissions"
        has_permissions=false
    fi
    
    # Check Redis permissions
    if ! redis-cli -u "$REDIS_URL" PING &>/dev/null; then
        log "ERROR" "Missing required Redis permissions"
        has_permissions=false
    fi
    
    return $has_permissions
}

# Function to clean databases with transaction safety
cleanup_databases() {
    log "INFO" "Starting database cleanup..."
    
    # Create backup before cleanup
    create_backup || {
        log "ERROR" "Backup creation failed"
        return 1
    }
    
    # Start transaction monitoring
    local start_time=$(date +%s)
    
    # Clean MongoDB collections
    log "INFO" "Cleaning MongoDB collections..."
    mongo "$DB_NAME" --eval '
        db.getCollectionNames().forEach(function(collName) {
            db[collName].deleteMany({});
        });
    ' || return 1
    
    # Clean PostgreSQL tables
    log "INFO" "Cleaning PostgreSQL tables..."
    psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "
        DO \$\$ 
        DECLARE 
            r RECORD;
        BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
        END \$\$;
    " || return 1
    
    # Clean Redis cache
    log "INFO" "Cleaning Redis cache..."
    redis-cli -u "$REDIS_URL" FLUSHDB || return 1
    
    # Clean vector store
    log "INFO" "Cleaning vector store..."
    curl -X POST "$VECTOR_DB_URL/api/clear" -H "Content-Type: application/json" || return 1
    
    # Verify cleanup completion
    if ! verify_cleanup; then
        log "ERROR" "Cleanup verification failed"
        return 1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log "INFO" "Database cleanup completed in $duration seconds"
    return 0
}

# Function to verify cleanup completion
verify_cleanup() {
    local retry_count=0
    
    while ((retry_count < VERIFICATION_RETRIES)); do
        log "INFO" "Verifying cleanup (attempt $((retry_count + 1))/$VERIFICATION_RETRIES)..."
        
        # Verify MongoDB
        local mongo_count=$(mongo "$DB_NAME" --quiet --eval '
            db.getCollectionNames().reduce((acc, coll) => 
                acc + db[coll].countDocuments({}), 0
            )
        ')
        
        # Verify PostgreSQL
        local psql_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -tAc "
            SELECT SUM(n_live_tup) 
            FROM pg_stat_user_tables;
        ")
        
        # Verify Redis
        local redis_count=$(redis-cli -u "$REDIS_URL" DBSIZE)
        
        # Verify vector store
        local vector_count=$(curl -s "$VECTOR_DB_URL/api/count" | jq '.count')
        
        if [[ "$mongo_count" -eq 0 ]] && \
           [[ "$psql_count" -eq 0 ]] && \
           [[ "$redis_count" -eq 0 ]] && \
           [[ "$vector_count" -eq 0 ]]; then
            log "INFO" "Cleanup verification successful"
            return 0
        fi
        
        ((retry_count++))
        sleep "$MIN_WAIT_TIME"
    done
    
    log "ERROR" "Cleanup verification failed after $VERIFICATION_RETRIES attempts"
    return 1
}

# Main execution function
main() {
    log "INFO" "Starting test data cleanup script"
    
    # Check environment
    if ! check_environment; then
        log "ERROR" "Environment check failed"
        exit 1
    fi
    
    # Execute cleanup with timeout
    if timeout "$CLEANUP_TIMEOUT" cleanup_databases; then
        log "INFO" "Test data cleanup completed successfully"
        exit 0
    else
        log "ERROR" "Test data cleanup failed or timed out"
        exit 1
    fi
}

# Execute main function
main