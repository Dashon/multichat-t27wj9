"""
Test package initialization for the Preference Engine service.
Configures test environment, imports test utilities, and exposes test fixtures.

Version: 1.0.0
"""

import os
import logging
import pytest  # v7.4+
from typing import Dict, Any
from ..src.config.settings import Settings

# Test environment constants
TEST_ENV = "testing"
TEST_LOG_LEVEL = "DEBUG"

def setup_test_environment() -> None:
    """
    Configures the test environment with required settings and variables.
    Sets up test databases, logging, and monitoring for preference engine tests.
    
    This function should be called at the start of test execution to ensure
    proper test isolation and configuration.
    """
    # Set test environment
    os.environ["PREF_ENGINE_ENV"] = TEST_ENV
    
    # Configure test logging
    logging.basicConfig(
        level=TEST_LOG_LEVEL,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger("preference_engine_tests")
    
    # Initialize test database URIs with unique test identifiers
    test_mongodb_uri = os.getenv(
        "TEST_MONGODB_URI",
        "mongodb://localhost:27017/preferences_test"
    )
    test_redis_uri = os.getenv(
        "TEST_REDIS_URI", 
        "redis://localhost:6379/15"  # Use database 15 for testing
    )
    
    # Override settings for test environment
    test_settings = {
        "MONGODB_URI": test_mongodb_uri,
        "REDIS_URI": test_redis_uri,
        "MODEL_UPDATE_INTERVAL": 60,  # Faster updates for testing
        "LEARNING_RATE": 0.1,  # Higher learning rate for testing
        "PREFERENCE_HISTORY_LIMIT": 10,  # Smaller limit for testing
        "CACHE_EXPIRY": 300,  # 5 minutes cache expiry for testing
        "MONITORING_CONFIG": {
            "enabled": True,
            "log_level": TEST_LOG_LEVEL,
            "metrics_interval": 10,  # Faster metrics collection
            "performance_tracking": True,
            "error_reporting": True
        },
        "DATABASE_OPTIONS": {
            "write_concern": "majority",
            "read_preference": "primary",  # Strict consistency for tests
            "max_pool_size": "10",
            "min_pool_size": "1",
            "max_idle_time_ms": "10000"
        }
    }
    
    # Create test settings instance
    test_settings_instance = Settings(**test_settings)
    
    # Register cleanup handler
    @pytest.fixture(autouse=True)
    def cleanup_test_data():
        """Automatically clean up test data after each test"""
        yield  # Run the test
        # Cleanup code here - will be executed after each test
        logger.info("Cleaning up test data...")
        
        # Clean MongoDB test database
        from pymongo import MongoClient
        client = MongoClient(test_settings_instance.MONGODB_URI)
        client.drop_database("preferences_test")
        
        # Clean Redis test database
        import redis
        redis_client = redis.from_url(test_settings_instance.REDIS_URI)
        redis_client.flushdb()
        
        logger.info("Test data cleanup completed")
    
    # Configure test monitoring
    @pytest.fixture(scope="session")
    def test_monitoring():
        """Configure monitoring for test execution"""
        from datadog import initialize, statsd
        
        options = {
            'statsd_host': 'localhost',
            'statsd_port': 8125,
            'namespace': 'preference_engine.test'
        }
        
        initialize(**options)
        return statsd
    
    # Log test environment setup completion
    logger.info(
        "Test environment configured with MongoDB: %s, Redis: %s",
        test_mongodb_uri,
        test_redis_uri
    )

# Initialize test environment when module is imported
setup_test_environment()

# Export test environment setup for external use
__all__ = ['setup_test_environment']