"""
Test suite for AI service context management functionality.
Tests context storage, retrieval, and maintenance with comprehensive coverage.

Version: 1.0.0
"""

import pytest
import numpy as np
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock

from ..src.context.context_manager import ContextManager
from ..src.context.vector_store import VectorStore

# Test constants
TEST_CHAT_ID = "test_chat_123"
TEST_MESSAGE = {
    "message_id": "msg_123",
    "sender_id": "user_123",
    "content": "test message",
    "timestamp": "2023-01-01T00:00:00Z"
}
TEST_EMBEDDING_DIM = 1536

@pytest.fixture
def mock_context():
    """Fixture providing mocked context manager with dependencies."""
    vector_store = Mock(spec=VectorStore)
    openai_service = AsyncMock()
    config = {
        "similarity_threshold": 0.7,
        "max_relevant_contexts": 5,
        "batch_size": 100
    }
    
    context_manager = ContextManager(vector_store, openai_service, config)
    return context_manager

@pytest.mark.asyncio
@pytest.mark.context
@pytest.mark.timeout(30)
async def test_add_message_to_context(mock_context, event_loop):
    """
    Test adding messages to context with batch processing and error handling.
    Verifies message storage, embedding generation, and context updates.
    """
    # Setup test data
    test_messages = [
        {**TEST_MESSAGE, "message_id": f"msg_{i}", 
         "content": f"test message {i}"} for i in range(5)
    ]
    test_embedding = np.random.rand(TEST_EMBEDDING_DIM)
    
    # Mock dependencies
    mock_context._openai_service.generate_embedding.return_value = test_embedding
    mock_context._vector_store.store_embedding.return_value = True
    
    # Test single message addition
    await mock_context.add_message_to_context(TEST_CHAT_ID, test_messages[0])
    
    # Verify context creation and message storage
    assert TEST_CHAT_ID in mock_context._active_contexts
    context = mock_context._active_contexts[TEST_CHAT_ID]
    assert len(context.short_term_memory) == 1
    assert context.short_term_memory[0]["message_id"] == test_messages[0]["message_id"]
    
    # Test batch message addition
    batch_messages = test_messages[1:]
    for msg in batch_messages:
        await mock_context.add_message_to_context(TEST_CHAT_ID, msg, batch_mode=True)
    
    # Verify batch processing
    assert len(context.short_term_memory) == 5
    assert mock_context._vector_store.store_embedding.call_count == 5
    
    # Test error handling
    mock_context._vector_store.store_embedding.side_effect = ConnectionError()
    with pytest.raises(ConnectionError):
        await mock_context.add_message_to_context(TEST_CHAT_ID, TEST_MESSAGE)
    
    # Verify cleanup on error
    assert len(context.short_term_memory) == 5

@pytest.mark.asyncio
@pytest.mark.context
@pytest.mark.timeout(20)
async def test_get_relevant_context(mock_context, event_loop):
    """
    Test retrieving relevant context with scoring and performance monitoring.
    Verifies search functionality, relevance scoring, and result ordering.
    """
    # Setup test data
    query = "test query"
    query_embedding = np.random.rand(TEST_EMBEDDING_DIM)
    similar_messages = [
        {"message_id": f"msg_{i}", "score": 0.8 - (i * 0.1)} 
        for i in range(3)
    ]
    
    # Mock dependencies
    mock_context._openai_service.generate_embedding.return_value = query_embedding
    mock_context._vector_store.search_similar.return_value = similar_messages
    
    # Add test messages to context
    context = mock_context._active_contexts.setdefault(TEST_CHAT_ID, Mock())
    context.short_term_memory = [
        {**TEST_MESSAGE, "message_id": msg["message_id"]}
        for msg in similar_messages
    ]
    
    # Test context retrieval
    results = await mock_context.get_relevant_context(
        TEST_CHAT_ID,
        query,
        {"threshold": 0.7, "limit": 5}
    )
    
    # Verify results
    assert len(results) == 3
    assert all("relevance_score" in msg for msg in results)
    assert results[0]["relevance_score"] > results[-1]["relevance_score"]
    
    # Test error handling
    mock_context._vector_store.search_similar.side_effect = TimeoutError()
    with pytest.raises(TimeoutError):
        await mock_context.get_relevant_context(TEST_CHAT_ID, query)

@pytest.mark.asyncio
@pytest.mark.context
@pytest.mark.timeout(25)
async def test_cleanup_stale_contexts(mock_context, event_loop):
    """
    Test cleanup of stale contexts with vector store integration.
    Verifies context age checking, cleanup operations, and resource management.
    """
    # Setup test data with mixed ages
    current_time = datetime.utcnow()
    stale_time = current_time - timedelta(hours=25)
    active_time = current_time - timedelta(hours=1)
    
    # Create test contexts
    mock_context._active_contexts = {
        "stale_chat": Mock(
            last_updated=stale_time,
            short_term_memory=[{**TEST_MESSAGE, "message_id": "stale_msg"}]
        ),
        "active_chat": Mock(
            last_updated=active_time,
            short_term_memory=[{**TEST_MESSAGE, "message_id": "active_msg"}]
        )
    }
    
    # Run cleanup
    await mock_context._periodic_cleanup()
    
    # Verify cleanup results
    assert "stale_chat" not in mock_context._active_contexts
    assert "active_chat" in mock_context._active_contexts
    assert len(mock_context._active_contexts) == 1
    
    # Test vector store cleanup
    mock_context._vector_store.cleanup_vectors.assert_called_once()

@pytest.mark.context
@pytest.mark.timeout(15)
def test_group_dynamics_analysis(mock_context):
    """
    Test group interaction pattern analysis with comprehensive metrics.
    Verifies participation tracking, response times, and interaction strength.
    """
    # Setup test data
    messages = [
        {**TEST_MESSAGE, 
         "message_id": f"msg_{i}",
         "sender_id": f"user_{i % 3}",
         "timestamp": (datetime.utcnow() + timedelta(minutes=i)).isoformat()}
        for i in range(10)
    ]
    
    # Add messages to context
    context = mock_context._active_contexts.setdefault(TEST_CHAT_ID, Mock())
    for msg in messages:
        mock_context.add_message_to_context(TEST_CHAT_ID, msg)
    
    # Test dynamics analysis
    dynamics = mock_context.get_group_dynamics(TEST_CHAT_ID)
    
    # Verify metrics
    assert len(dynamics["participation_metrics"]) == 3
    assert all(user in dynamics["participation_metrics"] 
              for user in ["user_0", "user_1", "user_2"])
    assert all(count > 0 for count in dynamics["participation_metrics"].values())
    
    # Verify response times
    assert len(dynamics["avg_response_times"]) == 3
    assert all(time > 0 for time in dynamics["avg_response_times"].values())
    
    # Verify interaction strength
    assert len(dynamics["interaction_strength"]) > 0
    assert all(0 <= strength <= 1 
              for strength in dynamics["interaction_strength"].values())