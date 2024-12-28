#!/bin/bash

# Performance Test Execution Script v1.0.0
# Dependencies:
# - artillery: ^2.0.0
# - k6: 0.45.0
# - node: >=18.0.0
# - npm: >=8.0.0

set -e  # Exit on error
set -u  # Exit on undefined variables

# Configuration and Environment Variables
TEST_ENV=${TEST_ENV:-"test"}
API_BASE_URL=${API_BASE_URL:-"http://localhost:3000"}
WS_BASE_URL=${WS_BASE_URL:-"ws://localhost:3001"}
ARTILLERY_REPORT_DIR=${ARTILLERY_REPORT_DIR:-"./reports/artillery"}
K6_REPORT_DIR=${K6_REPORT_DIR:-"./reports/k6"}
CONSOLIDATED_REPORT_DIR=${CONSOLIDATED_REPORT_DIR:-"./reports/consolidated"}

# Color codes for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging utility function
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} ${timestamp} - ${message}"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - ${message}"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - ${message}"
            ;;
    esac
}

# Check dependencies and their versions
check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is not installed"
        return 1
    fi
    
    local node_version=$(node -v | cut -d 'v' -f 2)
    if [[ $(echo "$node_version 18.0.0" | tr " " "\n" | sort -V | head -n 1) != "18.0.0" ]]; then
        log "ERROR" "Node.js version must be ≥ 18.0.0, found: $node_version"
        return 1
    fi
    
    # Check npm version
    if ! command -v npm &> /dev/null; then
        log "ERROR" "npm is not installed"
        return 1
    fi
    
    local npm_version=$(npm -v)
    if [[ $(echo "$npm_version 8.0.0" | tr " " "\n" | sort -V | head -n 1) != "8.0.0" ]]; then
        log "ERROR" "npm version must be ≥ 8.0.0, found: $npm_version"
        return 1
    }
    
    # Check Artillery
    if ! command -v artillery &> /dev/null; then
        log "ERROR" "Artillery is not installed"
        return 1
    fi
    
    local artillery_version=$(artillery -V | cut -d ' ' -f 2)
    if [[ $(echo "$artillery_version 2.0.0" | tr " " "\n" | sort -V | head -n 1) != "2.0.0" ]]; then
        log "ERROR" "Artillery version must be ≥ 2.0.0, found: $artillery_version"
        return 1
    }
    
    # Check K6
    if ! command -v k6 &> /dev/null; then
        log "ERROR" "K6 is not installed"
        return 1
    fi
    
    local k6_version=$(k6 version | cut -d ' ' -f 3)
    if [[ "$k6_version" != "v0.45.0" ]]; then
        log "ERROR" "K6 version must be 0.45.0, found: $k6_version"
        return 1
    }
    
    log "INFO" "All dependencies verified successfully"
    return 0
}

# Run Artillery test suites
run_artillery_tests() {
    log "INFO" "Starting Artillery test execution..."
    
    # Create report directory
    mkdir -p "$ARTILLERY_REPORT_DIR"
    
    # Execute API endpoint tests
    log "INFO" "Running API endpoint tests..."
    artillery run \
        --config ../performance/artillery/api-endpoints.yml \
        --target "$API_BASE_URL" \
        --output "$ARTILLERY_REPORT_DIR/api-test-report.json" \
        || { log "ERROR" "API endpoint tests failed"; return 1; }
    
    # Execute WebSocket load tests
    log "INFO" "Running WebSocket load tests..."
    artillery run \
        --config ../performance/artillery/websocket-load.yml \
        --target "$WS_BASE_URL" \
        --output "$ARTILLERY_REPORT_DIR/websocket-test-report.json" \
        || { log "ERROR" "WebSocket load tests failed"; return 1; }
    
    # Generate HTML reports
    artillery report \
        "$ARTILLERY_REPORT_DIR/api-test-report.json" \
        --output "$ARTILLERY_REPORT_DIR/api-test-report.html"
        
    artillery report \
        "$ARTILLERY_REPORT_DIR/websocket-test-report.json" \
        --output "$ARTILLERY_REPORT_DIR/websocket-test-report.html"
    
    log "INFO" "Artillery tests completed successfully"
    return 0
}

# Run K6 test suites
run_k6_tests() {
    log "INFO" "Starting K6 test execution..."
    
    # Create report directory
    mkdir -p "$K6_REPORT_DIR"
    
    # Set K6 options
    export K6_OUT="json=$K6_REPORT_DIR/k6-report.json"
    
    # Execute chat load tests
    log "INFO" "Running chat system load tests..."
    k6 run \
        --vus 100 \
        --duration 30m \
        --tag testid=chat-load \
        ../performance/k6/chat-load.test.js \
        || { log "ERROR" "Chat load tests failed"; return 1; }
    
    log "INFO" "K6 tests completed successfully"
    return 0
}

# Generate consolidated reports
generate_reports() {
    log "INFO" "Generating consolidated performance reports..."
    
    mkdir -p "$CONSOLIDATED_REPORT_DIR"
    
    # Combine test results
    node <<EOF
    const fs = require('fs');
    const path = require('path');

    // Read test results
    const artilleryApiReport = require('${ARTILLERY_REPORT_DIR}/api-test-report.json');
    const artilleryWsReport = require('${ARTILLERY_REPORT_DIR}/websocket-test-report.json');
    const k6Report = require('${K6_REPORT_DIR}/k6-report.json');

    // Generate consolidated report
    const consolidatedReport = {
        timestamp: new Date().toISOString(),
        summary: {
            totalDuration: artilleryApiReport.duration + artilleryWsReport.duration + k6Report.duration,
            totalRequests: artilleryApiReport.requests + artilleryWsReport.requests + k6Report.requests,
            successRate: (
                (artilleryApiReport.success + artilleryWsReport.success + k6Report.success) / 
                (artilleryApiReport.requests + artilleryWsReport.requests + k6Report.requests)
            ) * 100
        },
        performance: {
            api: {
                meanResponseTime: artilleryApiReport.meanResponseTime,
                p95ResponseTime: artilleryApiReport.p95ResponseTime
            },
            websocket: {
                meanLatency: artilleryWsReport.meanLatency,
                messageRate: artilleryWsReport.messageRate
            },
            chatSystem: {
                concurrentUsers: k6Report.metrics.vus.max,
                messageDeliveryTime: k6Report.metrics.message_delivery_time.p95
            }
        }
    };

    // Save consolidated report
    fs.writeFileSync(
        path.join('${CONSOLIDATED_REPORT_DIR}', 'consolidated-report.json'),
        JSON.stringify(consolidatedReport, null, 2)
    );
EOF
    
    log "INFO" "Reports generated successfully"
    return 0
}

# Main execution function
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    log "INFO" "Starting performance test execution..."
    
    # Check dependencies
    check_dependencies || { log "ERROR" "Dependency check failed"; exit 1; }
    
    # Create test directories
    mkdir -p "$ARTILLERY_REPORT_DIR" "$K6_REPORT_DIR" "$CONSOLIDATED_REPORT_DIR"
    
    # Run test suites
    run_artillery_tests || exit_code=$?
    run_k6_tests || exit_code=$?
    
    # Generate reports if tests completed
    if [ $exit_code -eq 0 ]; then
        generate_reports || exit_code=$?
    fi
    
    # Calculate execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Print execution summary
    log "INFO" "Performance test execution completed in ${duration} seconds"
    if [ $exit_code -eq 0 ]; then
        log "INFO" "All tests passed successfully"
    else
        log "ERROR" "Tests completed with errors (exit code: $exit_code)"
    fi
    
    return $exit_code
}

# Script entry point
main "$@"