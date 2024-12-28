"""
Test suite for AI agent implementations validating core functionality, 
specialized capabilities, and performance requirements.

Version: 1.0.0
"""

import pytest  # v7.4+
import numpy as np  # v1.24+
from unittest.mock import Mock, patch  # v3.11+
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any

# Internal imports
from ..src.agents.base_agent import BaseAgent
from ..src.agents.explorer_agent import ExplorerAgent, EXPLORER_CAPABILITIES
from ..src.models.agent import Agent, AGENT_TYPES
from ..src.services.langchain_service import LangChainService
from ..src.services.openai_service import OpenAIService

# Test constants
TEST_MESSAGE = "Where are the best attractions near the Louvre?"
TEST_CHAT_ID = "test-chat-123"
TEST_METADATA = {
    "location": "Paris",
    "preferences": {
        "type": "cultural",
        "budget": "medium"
    }
}

@pytest.mark.agent
@pytest.mark.timeout(5)
async def test_base_agent_initialization(mock_agent: pytest.Fixture) -> None:
    """
    Test proper initialization of base agent class including properties and services.
    """
    # Mock required services
    mock_langchain = Mock(spec=LangChainService)
    mock_openai = Mock(spec=OpenAIService)

    try:
        # Initialize base agent
        agent = BaseAgent(
            agent_data=mock_agent,
            langchain_service=mock_langchain,
            openai_service=mock_openai
        )

        # Verify agent properties
        assert agent.agent_data.name == "test_agent"
        assert "explorer" in agent.agent_data.specialties
        assert agent.agent_data.capabilities["text_processing"]
        assert agent.is_active

        # Verify service initialization
        assert agent.langchain_service == mock_langchain
        assert agent.openai_service == mock_openai

        # Verify context initialization
        assert isinstance(agent.context, dict)
        assert isinstance(agent.coordination_context, dict)
        assert isinstance(agent.response_metrics, dict)

    except Exception as e:
        pytest.fail(f"Agent initialization failed: {str(e)}")

@pytest.mark.agent
@pytest.mark.timeout(2)
@pytest.mark.parametrize("agent_type", ["explorer", "foodie", "planner"])
async def test_agent_message_processing(
    mock_agent: pytest.Fixture,
    agent_type: str
) -> None:
    """
    Test message processing functionality including performance and accuracy.
    """
    # Mock services with async response
    mock_langchain = Mock(spec=LangChainService)
    mock_langchain.get_agent_response = Mock(
        return_value=asyncio.Future()
    )
    mock_langchain.get_agent_response.return_value.set_result(
        "Test response for attraction recommendations"
    )

    # Initialize agent
    agent = BaseAgent(
        agent_data=mock_agent,
        langchain_service=mock_langchain,
        openai_service=Mock(spec=OpenAIService)
    )

    try:
        # Process test message
        start_time = datetime.now(timezone.utc)
        response = await agent.process_message(
            message=TEST_MESSAGE,
            chat_id=TEST_CHAT_ID,
            metadata=TEST_METADATA
        )
        processing_time = (datetime.now(timezone.utc) - start_time).total_seconds()

        # Verify response
        assert isinstance(response, str)
        assert len(response) > 0
        assert "response" in agent.context.get(TEST_CHAT_ID, {})

        # Verify performance
        assert processing_time < 2.0, "Response time exceeds 2s requirement"

        # Verify context updates
        context = agent.context.get(TEST_CHAT_ID, {})
        assert context.get("last_updated")
        assert TEST_METADATA["location"] in str(context)

    except Exception as e:
        pytest.fail(f"Message processing failed: {str(e)}")

@pytest.mark.agent
@pytest.mark.explorer
@pytest.mark.timeout(3)
async def test_explorer_agent_specialization(mock_agent: pytest.Fixture) -> None:
    """
    Test explorer agent's specialized capabilities and accuracy.
    """
    # Configure explorer agent
    mock_agent.specialties = ["explorer"]
    mock_langchain = Mock(spec=LangChainService)

    # Mock location-based responses
    mock_location_data = {
        "attractions": [
            {"name": "Louvre Museum", "rating": 4.8},
            {"name": "Notre-Dame", "rating": 4.7}
        ],
        "events": [
            {"name": "Art Exhibition", "date": "2024-01-20"},
            {"name": "Cultural Festival", "date": "2024-01-21"}
        ]
    }

    explorer_agent = ExplorerAgent(
        agent_data=mock_agent,
        langchain_service=mock_langchain
    )

    try:
        # Test location recommendations
        with patch.object(
            explorer_agent,
            '_fetch_location_data',
            return_value=asyncio.Future()
        ) as mock_fetch:
            mock_fetch.return_value.set_result(mock_location_data)
            
            response = await explorer_agent.process_message(
                message=TEST_MESSAGE,
                chat_id=TEST_CHAT_ID,
                metadata=TEST_METADATA
            )

        # Verify response content
        assert "Louvre" in response
        assert isinstance(response, str)
        assert len(response) > 50

        # Verify location cache
        assert TEST_METADATA["location"] in explorer_agent.location_cache
        assert len(explorer_agent.location_cache[TEST_METADATA["location"]]) > 0

        # Test event suggestions
        events = await explorer_agent.get_local_events(
            location=TEST_METADATA["location"],
            chat_id=TEST_CHAT_ID
        )
        assert len(events) > 0
        assert all(isinstance(event, dict) for event in events)

        # Verify capabilities
        assert explorer_agent.agent_data.capabilities["location_awareness"]
        assert explorer_agent.agent_data.capabilities["event_tracking"]

    except Exception as e:
        pytest.fail(f"Explorer agent specialization test failed: {str(e)}")

@pytest.mark.agent
@pytest.mark.context
@pytest.mark.timeout(2)
async def test_agent_context_management(mock_agent: pytest.Fixture) -> None:
    """
    Test agent context management including persistence and updates.
    """
    # Initialize agent with test context
    mock_langchain = Mock(spec=LangChainService)
    agent = BaseAgent(
        agent_data=mock_agent,
        langchain_service=mock_langchain,
        openai_service=Mock(spec=OpenAIService)
    )

    test_context = {
        "location": "Paris",
        "user_preferences": {
            "interests": ["art", "history"],
            "budget": "medium"
        }
    }

    try:
        # Update context
        await agent.update_context(
            chat_id=TEST_CHAT_ID,
            new_context=test_context
        )

        # Verify context persistence
        assert TEST_CHAT_ID in agent.context
        assert agent.context[TEST_CHAT_ID]["location"] == "Paris"
        assert "user_preferences" in agent.context[TEST_CHAT_ID]

        # Test context influence on response
        with patch.object(
            agent.langchain_service,
            'get_agent_response',
            return_value=asyncio.Future()
        ) as mock_response:
            mock_response.return_value.set_result("Context-aware response")
            
            response = await agent.process_message(
                message=TEST_MESSAGE,
                chat_id=TEST_CHAT_ID,
                metadata=TEST_METADATA
            )

        # Verify context-aware processing
        assert isinstance(response, str)
        assert agent.context[TEST_CHAT_ID]["last_updated"]

        # Test context cleanup
        old_context = agent.context[TEST_CHAT_ID].copy()
        await agent.update_context(
            chat_id=TEST_CHAT_ID,
            new_context={"new_data": "test"}
        )
        assert agent.context[TEST_CHAT_ID] != old_context

    except Exception as e:
        pytest.fail(f"Context management test failed: {str(e)}")