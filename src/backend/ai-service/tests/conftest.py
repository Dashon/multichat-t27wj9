# Python 3.11+
import pytest
import mongomock
import numpy as np
import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Any, AsyncGenerator

from ..src.models.agent import Agent, AGENT_TYPES, DEFAULT_CAPABILITIES
from ..src.models.context import Context, EMBEDDING_DIMENSION

# Test configuration constants
TEST_AGENT_CONFIG = {
    "text_processing": True,
    "context_awareness": True,
    "response_time": "fast",
    "specialties": ["travel", "dining", "planning"],
    "performance_metrics": {
        "max_response_time": 2000,
        "max_context_size": 1000
    }
}

TEST_EMBEDDING_DIM = 1536  # Matches EMBEDDING_DIMENSION from context.py

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure pytest environment with custom markers and settings.
    
    Args:
        config: pytest configuration object
    """
    # Register custom markers
    config.addinivalue_line("markers", "agent: mark test as agent-related")
    config.addinivalue_line("markers", "context: mark test as context-related")
    config.addinivalue_line("markers", "integration: mark test as integration test")
    config.addinivalue_line("markers", "performance: mark test as performance-sensitive")
    
    # Set test environment variables
    os.environ["TEST_MODE"] = "true"
    os.environ["MONGODB_URL"] = "mongodb://testdb:27017"
    
    # Configure numpy for reproducible tests
    np.random.seed(42)

def pytest_collection_modifyitems(config: pytest.Config, items: list) -> None:
    """
    Modify test collection with custom markers and skip conditions.
    
    Args:
        config: pytest configuration object
        items: list of collected test items
    """
    for item in items:
        # Add markers based on test path and name
        if "agent" in item.nodeid:
            item.add_marker(pytest.mark.agent)
        if "context" in item.nodeid:
            item.add_marker(pytest.mark.context)
        if "test_performance" in item.nodeid:
            item.add_marker(pytest.mark.performance)
        
        # Skip performance tests in CI environment unless explicitly enabled
        if "performance" in item.keywords and not config.getoption("--run-performance"):
            item.add_marker(pytest.mark.skip(reason="Performance test skipped in CI"))

@pytest.fixture
def mock_agent() -> Agent:
    """
    Provides a mock Agent instance for testing.
    
    Returns:
        Agent: Configured test agent instance
    """
    return Agent(
        name="test_agent",
        specialties=["explorer", "foodie"],
        capabilities={
            "text_processing": True,
            "context_awareness": True,
            "proactive_suggestions": False,
            "group_coordination": True
        },
        config={
            "response_timeout": 5,
            "context_window": 500,
            "max_tokens": 200,
            "temperature": 0.7
        }
    )

@pytest.fixture
def mock_context() -> Context:
    """
    Provides a mock Context instance for testing.
    
    Returns:
        Context: Configured test context instance
    """
    context = Context(chat_id="test_chat_123")
    
    # Add sample messages
    sample_messages = [
        {
            "message_id": f"msg_{i}",
            "sender_id": f"user_{i % 3}",
            "content": f"Test message {i}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        for i in range(5)
    ]
    
    for message in sample_messages:
        context.add_message(message)
        # Add mock embeddings
        context.update_embeddings(
            message["message_id"],
            np.random.rand(TEST_EMBEDDING_DIM)
        )
    
    return context

@pytest.fixture
async def mock_db() -> AsyncGenerator[mongomock.MongoClient, None]:
    """
    Provides a mock MongoDB instance for testing.
    
    Yields:
        mongomock.MongoClient: Mock MongoDB client
    """
    client = mongomock.MongoClient()
    db = client.test_db
    
    # Initialize collections
    await db.agents.create_index("name", unique=True)
    await db.contexts.create_index("chat_id", unique=True)
    
    yield client
    
    # Cleanup
    client.drop_database("test_db")

@pytest.fixture
async def event_loop() -> AsyncGenerator[asyncio.AbstractEventLoop, None]:
    """
    Provides an event loop for async tests.
    
    Yields:
        asyncio.AbstractEventLoop: Test event loop
    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    
    # Cleanup pending tasks
    pending = asyncio.all_tasks(loop)
    for task in pending:
        task.cancel()
    
    await asyncio.gather(*pending, return_exceptions=True)
    await loop.shutdown_asyncgens()
    loop.close()

@pytest.fixture
def performance_threshold() -> Dict[str, float]:
    """
    Provides performance thresholds for testing.
    
    Returns:
        Dict[str, float]: Performance threshold values
    """
    return {
        "max_response_time": 2.0,  # seconds
        "min_success_rate": 95.0,  # percentage
        "max_memory_usage": 512.0  # MB
    }

@pytest.fixture
def vector_similarity_threshold() -> float:
    """
    Provides threshold for vector similarity comparisons.
    
    Returns:
        float: Similarity threshold value
    """
    return 0.85  # Cosine similarity threshold