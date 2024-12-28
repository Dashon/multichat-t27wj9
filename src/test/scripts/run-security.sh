#!/bin/bash

# Enhanced Security Test Suite Runner
# Version: 1.0.0
#
# Executes comprehensive security test suites including API security,
# authentication, and data protection tests with enhanced monitoring,
# reporting and threshold validation capabilities.

# Exit on any error
set -e

# Configuration
MAX_RETRIES=3
TIMEOUT_MINUTES=30
SECURITY_ALERT_THRESHOLD="critical"
PERFORMANCE_BASELINE=2000

# Colors for output
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
    log "${RED}Error on line $1${NC}"
    # Generate error report
    generate_error_report $1
    exit 1
}

# Set error handler
trap 'handle_error $LINENO' ERR

# Function to generate detailed error report
generate_error_report() {
    local error_line=$1
    local report_file="security_test_error_report_$(date +'%Y%m%d_%H%M%S').log"
    
    {
        echo "Security Test Error Report"
        echo "========================="
        echo "Timestamp: $(date +'%Y-%m-%d %H:%M:%S')"
        echo "Error Line: $error_line"
        echo "Last Exit Code: $?"
        echo "Environment Info:"
        echo "Node Version: $(node -v)"
        echo "NPM Version: $(npm -v)"
        echo "System Info: $(uname -a)"
    } > "$report_file"
    
    log "${YELLOW}Error report generated: $report_file${NC}"
}

# Function to setup test environment
setup_environment() {
    log "${GREEN}Setting up security test environment...${NC}"
    
    # Validate required environment variables
    if [ -z "$NODE_ENV" ]; then
        export NODE_ENV="test"
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log "Installing dependencies..."
        npm install
    fi
    
    # Initialize test database with security context
    log "Initializing test database..."
    npm run db:test:init
    
    # Setup security monitoring
    log "Configuring security monitoring..."
    export SECURITY_MONITORING=true
    export PERFORMANCE_MONITORING=true
    
    log "${GREEN}Environment setup complete${NC}"
}

# Function to run API security tests
run_api_security_tests() {
    log "${GREEN}Running API security tests...${NC}"
    
    local retry_count=0
    local success=false
    
    while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; do
        if npx jest --config=jest.security.config.js --testMatch="**/test/security/api/**/*.test.ts" --runInBand; then
            success=true
            log "${GREEN}API security tests completed successfully${NC}"
        else
            retry_count=$((retry_count + 1))
            if [ $retry_count -lt $MAX_RETRIES ]; then
                log "${YELLOW}Retrying API security tests (Attempt $retry_count of $MAX_RETRIES)${NC}"
                sleep 5
            fi
        fi
    done
    
    if [ "$success" = false ]; then
        log "${RED}API security tests failed after $MAX_RETRIES attempts${NC}"
        return 1
    fi
}

# Function to run authentication security tests
run_auth_security_tests() {
    log "${GREEN}Running authentication security tests...${NC}"
    
    local retry_count=0
    local success=false
    
    while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; do
        if npx jest --config=jest.security.config.js --testMatch="**/test/security/auth/**/*.test.ts" --runInBand; then
            success=true
            log "${GREEN}Authentication security tests completed successfully${NC}"
        else
            retry_count=$((retry_count + 1))
            if [ $retry_count -lt $MAX_RETRIES ]; then
                log "${YELLOW}Retrying authentication tests (Attempt $retry_count of $MAX_RETRIES)${NC}"
                sleep 5
            fi
        fi
    done
    
    if [ "$success" = false ]; then
        log "${RED}Authentication security tests failed after $MAX_RETRIES attempts${NC}"
        return 1
    fi
}

# Function to run data security tests
run_data_security_tests() {
    log "${GREEN}Running data security tests...${NC}"
    
    local retry_count=0
    local success=false
    
    while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; do
        if npx jest --config=jest.security.config.js --testMatch="**/test/security/data/**/*.test.ts" --runInBand; then
            success=true
            log "${GREEN}Data security tests completed successfully${NC}"
        else
            retry_count=$((retry_count + 1))
            if [ $retry_count -lt $MAX_RETRIES ]; then
                log "${YELLOW}Retrying data security tests (Attempt $retry_count of $MAX_RETRIES)${NC}"
                sleep 5
            fi
        fi
    done
    
    if [ "$success" = false ]; then
        log "${RED}Data security tests failed after $MAX_RETRIES attempts${NC}"
        return 1
    fi
}

# Function to generate comprehensive test report
generate_report() {
    local report_file="security_test_report_$(date +'%Y%m%d_%H%M%S').html"
    
    {
        echo "<html><head><title>Security Test Report</title></head><body>"
        echo "<h1>Security Test Report</h1>"
        echo "<p>Generated: $(date +'%Y-%m-%d %H:%M:%S')</p>"
        echo "<h2>Test Results Summary</h2>"
        echo "<ul>"
        echo "<li>API Security Tests: ${api_result:-N/A}</li>"
        echo "<li>Authentication Tests: ${auth_result:-N/A}</li>"
        echo "<li>Data Security Tests: ${data_result:-N/A}</li>"
        echo "</ul>"
        echo "<h2>Performance Metrics</h2>"
        echo "<pre>$(cat security_test_metrics.log 2>/dev/null || echo 'No metrics available')</pre>"
        echo "</body></html>"
    } > "$report_file"
    
    log "${GREEN}Test report generated: $report_file${NC}"
}

# Function to cleanup test environment
cleanup() {
    log "${GREEN}Cleaning up test environment...${NC}"
    
    # Clean up test database
    npm run db:test:cleanup
    
    # Remove temporary files
    rm -f security_test_metrics.log
    
    # Reset environment variables
    unset SECURITY_MONITORING
    unset PERFORMANCE_MONITORING
    
    log "${GREEN}Cleanup complete${NC}"
}

# Main execution
main() {
    log "${GREEN}Starting security test suite...${NC}"
    
    # Setup environment
    setup_environment
    
    # Set timeout
    export JEST_TIMEOUT=$((TIMEOUT_MINUTES * 60 * 1000))
    
    # Run test suites
    if run_api_security_tests; then
        api_result="PASSED"
    else
        api_result="FAILED"
    fi
    
    if run_auth_security_tests; then
        auth_result="PASSED"
    else
        auth_result="FAILED"
    fi
    
    if run_data_security_tests; then
        data_result="PASSED"
    else
        data_result="FAILED"
    fi
    
    # Generate report
    generate_report
    
    # Cleanup
    cleanup
    
    # Check overall result
    if [ "$api_result" = "PASSED" ] && [ "$auth_result" = "PASSED" ] && [ "$data_result" = "PASSED" ]; then
        log "${GREEN}All security tests completed successfully${NC}"
        exit 0
    else
        log "${RED}Some security tests failed. Check the report for details${NC}"
        exit 1
    fi
}

# Execute main function
main