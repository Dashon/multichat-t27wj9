#!/bin/bash

# AI-Enhanced Group Chat Platform
# End-to-End Test Execution Script
# Version: 1.0.0
# Dependencies:
# - Node.js v18+
# - npm v8+
# - jest v29.0.0
# - cross-env v7.0.3
# - rimraf v5.0.0

# Exit on any error
set -e

# Trap cleanup function on script exit
trap cleanup EXIT

# Load common functions and logging utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/logging.sh"

# Global variables
JEST_WORKERS=${JEST_WORKERS:-3}
TEST_TIMEOUT=${TEST_TIMEOUT:-30000}
COVERAGE_THRESHOLD=${COVERAGE_THRESHOLD:-80}
RETRY_ATTEMPTS=3
TEST_RESULTS_DIR="test-results"
COVERAGE_DIR="coverage"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function with timestamp
log() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling function
handle_error() {
    log "${RED}Error: $1${NC}"
    exit 1
}

# Check if required dependencies are installed
check_dependencies() {
    log "Checking dependencies..."
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d 'v' -f 2)
    if [[ ! "${NODE_VERSION}" =~ ^18\. ]]; then
        handle_error "Node.js v18+ is required (found v${NODE_VERSION})"
    fi
    
    # Check npm installation
    if ! command -v npm >/dev/null 2>&1; then
        handle_error "npm is not installed"
    fi
    
    # Verify required packages
    local required_packages=("jest" "cross-env" "rimraf")
    for package in "${required_packages[@]}"; do
        if ! npm list "${package}" >/dev/null 2>&1; then
            handle_error "${package} is not installed"
        fi
    done
    
    log "${GREEN}All dependencies verified successfully${NC}"
}

# Set up test environment
setup_test_env() {
    log "Setting up test environment..."
    
    # Create test results directory
    mkdir -p "${TEST_RESULTS_DIR}"
    
    # Set environment variables
    export NODE_ENV=test
    export TEST_DB_URL="mongodb://localhost:27017/test"
    
    # Load and validate environment configuration
    if ! node -e "require('../config/environment').loadTestEnvironment().then(() => process.exit(0)).catch(() => process.exit(1))"; then
        handle_error "Failed to load test environment configuration"
    fi
    
    # Clean previous test artifacts
    rimraf "${COVERAGE_DIR}" "${TEST_RESULTS_DIR}"/*
    
    log "${GREEN}Test environment setup completed${NC}"
}

# Execute test suites
run_tests() {
    log "Starting test execution..."
    
    # Build test suites list
    local test_suites=(
        "e2e/ai/agent-interaction.test.ts"
        "e2e/ai/context-awareness.test.ts"
        "e2e/chat/group-chat.test.ts"
    )
    
    # Configure Jest arguments
    local jest_args=(
        "--config=jest.config.ts"
        "--maxWorkers=${JEST_WORKERS}"
        "--coverage"
        "--coverageDirectory=${COVERAGE_DIR}"
        "--testTimeout=${TEST_TIMEOUT}"
        "--forceExit"
        "--detectOpenHandles"
        "--verbose"
    )
    
    # Execute tests with retry mechanism
    local attempt=1
    local success=false
    
    while [[ ${attempt} -le ${RETRY_ATTEMPTS} && ${success} == false ]]; do
        log "Test execution attempt ${attempt}/${RETRY_ATTEMPTS}"
        
        if cross-env NODE_ENV=test jest "${jest_args[@]}" "${test_suites[@]}"; then
            success=true
            break
        fi
        
        ((attempt++))
        if [[ ${attempt} -le ${RETRY_ATTEMPTS} ]]; then
            log "${YELLOW}Retrying test execution...${NC}"
            sleep 5
        fi
    done
    
    if [[ ${success} == false ]]; then
        handle_error "Test execution failed after ${RETRY_ATTEMPTS} attempts"
    fi
    
    # Verify coverage thresholds
    if ! node -e "require('../jest.config').coverageThreshold.global.statements >= ${COVERAGE_THRESHOLD}"; then
        handle_error "Coverage threshold not met"
    fi
    
    log "${GREEN}Test execution completed successfully${NC}"
}

# Cleanup function
cleanup() {
    log "Performing cleanup..."
    
    # Stop any running test services
    if [[ -f ".test.pid" ]]; then
        kill $(cat .test.pid) 2>/dev/null || true
        rm .test.pid
    fi
    
    # Archive test results
    if [[ -d "${TEST_RESULTS_DIR}" ]]; then
        tar -czf "test-results-$(date +'%Y%m%d_%H%M%S').tar.gz" "${TEST_RESULTS_DIR}"
        rimraf "${TEST_RESULTS_DIR}"
    fi
    
    # Remove temporary files
    find . -name "*.tmp" -type f -delete
    
    log "${GREEN}Cleanup completed${NC}"
}

# Main execution
main() {
    log "Starting E2E test execution script..."
    
    # Execute steps with error handling
    check_dependencies || handle_error "Dependency check failed"
    setup_test_env || handle_error "Environment setup failed"
    run_tests || handle_error "Test execution failed"
    
    log "${GREEN}E2E test execution completed successfully${NC}"
}

# Execute main function
main