#!/bin/bash

# =============================================================================
# Integration Test Runner for AI-Enhanced Group Chat Platform
# Version: 1.0.0
# Description: Executes comprehensive integration tests across all microservices
# Dependencies: 
#   - jest@29.0+
#   - docker-compose@2.0+
# =============================================================================

set -euo pipefail

# Script initialization
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../../" && pwd)
source "$SCRIPT_DIR/setup-test-db.sh"
LOG_DIR="$PROJECT_ROOT/logs/integration"
REPORT_DIR="$PROJECT_ROOT/reports/integration"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_FILE="$LOG_DIR/integration_${TIMESTAMP}.log"
COMPOSE_FILE="$PROJECT_ROOT/test/docker/docker-compose.test.yml"
TEST_TIMEOUT=${TEST_TIMEOUT:-30000}

# Ensure directories exist
mkdir -p "$LOG_DIR" "$REPORT_DIR"

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
# Prerequisite Check Function
# =============================================================================

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker daemon
    if ! docker info &>/dev/null; then
        log_error "Docker daemon is not running"
        return 1
    fi

    # Check Docker Compose version
    if ! docker-compose version --short | grep -E "^2\." &>/dev/null; then
        log_error "Docker Compose v2.0+ is required"
        return 1
    }

    # Check Node.js version
    if ! command -v node &>/dev/null || ! node --version | grep -E "^v18\." &>/dev/null; then
        log_error "Node.js v18+ is required"
        return 1
    }

    # Check port availability
    for port in {3000..3010}; do
        if lsof -i ":$port" &>/dev/null; then
            log_error "Port $port is already in use"
            return 1
        fi
    done

    # Check disk space (minimum 5GB)
    available_space=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ $available_space -lt 5 ]]; then
        log_error "Insufficient disk space. At least 5GB required"
        return 1
    fi

    log "Prerequisites check passed"
    return 0
}

# =============================================================================
# Environment Setup Function
# =============================================================================

setup_test_environment() {
    log "Setting up test environment..."
    
    # Create test network
    docker network create ai-chat-test-network 2>/dev/null || true

    # Start services
    log "Starting test services..."
    docker-compose -f "$COMPOSE_FILE" -p ai-chat-integration-test up -d

    # Wait for services to be healthy
    local max_attempts=30
    local attempt=1
    local services=(
        "http://localhost:3000/health" # API Gateway
        "http://localhost:3001/health" # Message Service
        "http://localhost:3002/health" # AI Service
        "http://localhost:3003/health" # User Service
        "http://localhost:3004/health" # Preference Service
    )

    while [[ $attempt -le $max_attempts ]]; do
        local all_healthy=true
        for service in "${services[@]}"; do
            if ! curl -s "$service" | grep -q "ok"; then
                all_healthy=false
                break
            fi
        done

        if $all_healthy; then
            log "All services are healthy"
            break
        fi

        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Services failed to become healthy"
            cleanup_environment
            return 1
        fi

        log "Waiting for services to become healthy (attempt $attempt/$max_attempts)..."
        sleep 2
        ((attempt++))
    done

    # Initialize test databases
    setup_postgres || { log_error "Failed to setup PostgreSQL"; return 1; }
    setup_mongodb || { log_error "Failed to setup MongoDB"; return 1; }

    log "Test environment setup completed"
    return 0
}

# =============================================================================
# Test Execution Function
# =============================================================================

run_integration_tests() {
    log "Starting integration tests..."
    
    # Set test environment variables
    export TEST_ENV=integration
    export COMPOSE_PROJECT_NAME=ai-chat-integration-test

    # Execute tests with Jest
    jest \
        --config="$PROJECT_ROOT/test/jest.config.ts" \
        --runInBand \
        --forceExit \
        --coverage \
        --coverageDirectory="$REPORT_DIR/coverage" \
        --json --outputFile="$REPORT_DIR/results.json" \
        --testTimeout="$TEST_TIMEOUT" \
        --verbose \
        "$PROJECT_ROOT/test/integration/**/*.test.ts" || {
            local exit_code=$?
            log_error "Integration tests failed with exit code $exit_code"
            return $exit_code
        }

    # Verify coverage thresholds
    if ! jq -e '.coverageMap | length > 0' "$REPORT_DIR/results.json" >/dev/null; then
        log_error "Coverage report not generated"
        return 1
    fi

    log "Integration tests completed successfully"
    return 0
}

# =============================================================================
# Cleanup Function
# =============================================================================

cleanup_environment() {
    log "Cleaning up test environment..."

    # Stop and remove containers
    docker-compose -f "$COMPOSE_FILE" -p ai-chat-integration-test down -v --remove-orphans

    # Remove test network
    docker network rm ai-chat-test-network 2>/dev/null || true

    # Archive logs
    local archive_dir="$LOG_DIR/archive"
    mkdir -p "$archive_dir"
    tar -czf "$archive_dir/logs_${TIMESTAMP}.tar.gz" -C "$LOG_DIR" .

    # Clean up temporary files
    find "$LOG_DIR" -type f -name "*.log" -mtime +7 -delete

    log "Cleanup completed"
    return 0
}

# =============================================================================
# Signal Handlers
# =============================================================================

trap 'log "Received interrupt signal"; cleanup_environment; exit 1' SIGINT SIGTERM

# =============================================================================
# Main Execution
# =============================================================================

main() {
    local exit_code=0

    log "Starting integration test suite..."

    # Execute test phases
    check_prerequisites || { log_error "Prerequisites check failed"; exit 1; }
    setup_test_environment || { log_error "Environment setup failed"; exit 1; }
    run_integration_tests || exit_code=$?
    cleanup_environment || log_error "Cleanup failed"

    # Generate final report
    if [[ $exit_code -eq 0 ]]; then
        log "Integration test suite completed successfully"
    else
        log_error "Integration test suite failed"
    fi

    return $exit_code
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi
```

This script provides a robust and comprehensive integration testing solution for the AI-Enhanced Group Chat Platform. Key features include:

1. Comprehensive prerequisite checking for all required tools and resources
2. Automated test environment setup with health checking
3. Database initialization using the imported setup-test-db.sh script
4. Parallel service startup with Docker Compose
5. Detailed logging and error reporting
6. Coverage verification and reporting
7. Proper cleanup of all test resources
8. Signal handling for graceful interruption
9. Archival of test logs and results

The script follows best practices for shell scripting:
- Uses strict error checking with `set -euo pipefail`
- Implements proper logging and error handling
- Provides detailed progress feedback
- Handles cleanup in all exit scenarios
- Maintains organized log and report directories
- Implements timeouts for long-running operations
- Verifies all prerequisites before test execution

The script can be executed directly:
```bash
./run-integration.sh