"""
Pytest configuration and fixtures for preference engine tests.
Provides comprehensive test setup, mock data, database fixtures, and test utilities.

Version: 1.0.0
"""

import asyncio
import logging
import pytest
import mongomock
import fakeredis
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, AsyncGenerator, Any

from ..src.config.settings import Settings
from ..src.models.preference import PreferenceModel
from ..src.models.user_profile import UserProfile

# Test configuration constants
TEST_MONGODB_URI = "mongodb://testdb:27017/test_preferences"
TEST_REDIS_URI = "redis://testcache:6379/0"
TEST_LOG_LEVEL = logging.DEBUG
PERFORMANCE_THRESHOLD_MS = 2000  # Maximum allowed response time in milliseconds
MIN_TEST_COVERAGE = 90  # Minimum required test coverage percentage

def pytest_configure(config: pytest.Config) -> None:
    """
    Configures pytest environment for preference engine tests.
    
    Args:
        config: Pytest configuration object
    """
    # Register custom markers
    config.addinivalue_line(
        "markers",
        "performance: marks tests that validate performance requirements"
    )
    config.addinivalue_line(
        "markers",
        "integration: marks integration tests with external dependencies"
    )
    config.addinivalue_line(
        "markers",
        "learning: marks tests for preference learning algorithms"
    )
    
    # Configure test coverage requirements
    config.option.cov_fail_under = MIN_TEST_COVERAGE
    
    # Setup logging for tests
    logging.basicConfig(
        level=TEST_LOG_LEVEL,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )
    
    # Configure async test support
    config.addinivalue_line(
        "asyncio_mode",
        "auto"
    )

def pytest_sessionfinish(session: pytest.Session) -> None:
    """
    Cleanup after test session completion.
    
    Args:
        session: Pytest session object
    """
    logging.info("Cleaning up test resources...")
    
    # Reset test databases
    mongomock.MongoClient(TEST_MONGODB_URI).drop_database('test_preferences')
    fakeredis.FakeStrictRedis.from_url(TEST_REDIS_URI).flushall()

@pytest.fixture
async def mock_mongodb() -> AsyncGenerator[mongomock.MongoClient, None]:
    """
    Provides mocked MongoDB client for tests.
    
    Yields:
        Mocked MongoDB client instance
    """
    client = mongomock.MongoClient(TEST_MONGODB_URI)
    yield client
    await client.close()

@pytest.fixture
async def mock_redis() -> AsyncGenerator[fakeredis.FakeRedis, None]:
    """
    Provides mocked Redis client for tests.
    
    Yields:
        Mocked Redis client instance
    """
    client = fakeredis.FakeStrictRedis.from_url(TEST_REDIS_URI)
    yield client
    await client.close()

@pytest.fixture
def test_user_profile() -> UserProfile:
    """
    Provides test user profile instance with predefined preferences.
    
    Returns:
        Configured UserProfile instance
    """
    user_id = uuid.uuid4()
    return UserProfile(
        user_id=user_id,
        preferences={
            "chat": {
                "theme": "dark",
                "font_size": "medium",
                "notifications_enabled": True
            },
            "ai_agent": {
                "proactive_suggestions": True,
                "preferred_agents": ["explorer", "foodie"]
            }
        },
        learning_patterns={
            "chat": {
                "consistency_score": 0.8,
                "temporal_patterns": {},
                "preference_stability": 0.7
            }
        }
    )

@pytest.fixture
def test_preference() -> PreferenceModel:
    """
    Provides test preference instance with sample data.
    
    Returns:
        Configured PreferenceModel instance
    """
    return PreferenceModel(
        user_id=uuid.uuid4(),
        preference_type="chat",
        preference_data={
            "theme": "dark",
            "font_size": "medium"
        },
        confidence_score=0.8
    )

@pytest.fixture
def performance_tracker() -> Dict:
    """
    Provides performance tracking utilities for tests.
    
    Returns:
        Dictionary containing performance tracking methods
    """
    start_times: Dict[str, float] = {}
    
    def start_operation(operation_name: str) -> None:
        start_times[operation_name] = asyncio.get_event_loop().time()
    
    def end_operation(operation_name: str) -> float:
        if operation_name not in start_times:
            raise ValueError(f"Operation {operation_name} was not started")
        duration = (asyncio.get_event_loop().time() - start_times[operation_name]) * 1000
        del start_times[operation_name]
        return duration
    
    def assert_performance(operation_name: str, max_duration: Optional[float] = None) -> None:
        duration = end_operation(operation_name)
        max_allowed = max_duration or PERFORMANCE_THRESHOLD_MS
        assert duration <= max_allowed, (
            f"Operation {operation_name} took {duration}ms, "
            f"exceeding limit of {max_allowed}ms"
        )
    
    return {
        "start_operation": start_operation,
        "end_operation": end_operation,
        "assert_performance": assert_performance
    }

@pytest.fixture
def test_settings() -> Settings:
    """
    Provides test configuration settings.
    
    Returns:
        Configured Settings instance
    """
    return Settings(
        MONGODB_URI=TEST_MONGODB_URI,
        REDIS_URI=TEST_REDIS_URI,
        MODEL_UPDATE_INTERVAL=60,
        LEARNING_RATE=0.01,
        PREFERENCE_HISTORY_LIMIT=100,
        CACHE_EXPIRY=300
    )

@pytest.fixture
def mock_learning_data() -> Dict[str, List[Dict[str, Any]]]:
    """
    Provides mock learning data for preference tests.
    
    Returns:
        Dictionary containing mock learning data
    """
    base_time = datetime.utcnow()
    return {
        "chat": [
            {
                "timestamp": base_time - timedelta(days=i),
                "data": {"theme": "dark", "font_size": "medium"},
                "confidence": 0.8,
                "context": {"time_of_day": "evening"}
            }
            for i in range(10)
        ],
        "ai_agent": [
            {
                "timestamp": base_time - timedelta(days=i),
                "data": {"proactive_suggestions": True},
                "confidence": 0.7,
                "context": {"interaction_type": "query"}
            }
            for i in range(5)
        ]
    }