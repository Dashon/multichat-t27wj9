"""
Base Agent Module
Implements the abstract base class for AI agents with enhanced capabilities including
context management, response validation, and performance optimization.

Version: 1.0.0
"""

from abc import ABC, abstractmethod  # v3.11+
from typing import Dict, List, Any, Optional, Tuple  # v3.11+
from dataclasses import dataclass  # v3.11+
import asyncio  # v3.11+
import logging
from datetime import datetime, timezone
from prometheus_client import Summary, Counter, Gauge  # v0.17+

# Internal imports
from ..models.agent import Agent, AGENT_TYPES
from ..services.langchain_service import LangChainService
from ..services.openai_service import OpenAIService

# Constants for configuration
DEFAULT_RESPONSE_TEMPLATE = "I am {agent_name}, specialized in {specialties}. {response}"
DEFAULT_TIMEOUT_CONFIG = {
    "response_timeout": 1.5,  # seconds
    "validation_timeout": 0.3  # seconds
}
QUALITY_THRESHOLDS = {
    "min_confidence": 0.9,
    "max_latency": 2.0
}

# Prometheus metrics
AGENT_METRICS = {
    "response_time": Summary("agent_response_time_seconds", "Time taken for agent response"),
    "validation_time": Summary("agent_validation_time_seconds", "Time taken for response validation"),
    "quality_score": Gauge("agent_response_quality", "Quality score of agent responses"),
    "error_count": Counter("agent_errors_total", "Total number of agent errors", ["error_type"])
}

@dataclass
class BaseAgent(ABC):
    """
    Enhanced abstract base class for AI agents with comprehensive capabilities.
    
    Attributes:
        agent_data: Agent configuration and metadata
        langchain_service: LangChain integration service
        openai_service: OpenAI service for direct API access
        context: Current conversation context
        coordination_context: Multi-agent coordination data
        response_metrics: Performance tracking metrics
        _timeout_config: Timeout configuration
        is_active: Agent operational status
    """

    agent_data: Agent
    langchain_service: LangChainService
    openai_service: OpenAIService
    context: Dict[str, Any]
    coordination_context: Dict[str, Any]
    response_metrics: Dict[str, float]
    _timeout_config: Dict[str, float]
    is_active: bool

    def __init__(
        self,
        agent_data: Agent,
        langchain_service: LangChainService,
        openai_service: OpenAIService,
        timeout_config: Optional[Dict[str, float]] = None
    ):
        """
        Initialize base agent with required services and configuration.
        
        Args:
            agent_data: Agent configuration and metadata
            langchain_service: LangChain integration service
            openai_service: OpenAI service instance
            timeout_config: Optional custom timeout settings
        
        Raises:
            ValueError: If agent configuration is invalid
        """
        self.agent_data = agent_data
        self.langchain_service = langchain_service
        self.openai_service = openai_service
        self.context = {}
        self.coordination_context = {}
        self.response_metrics = {
            "avg_response_time": 0.0,
            "avg_quality_score": 0.0,
            "success_rate": 100.0
        }
        self._timeout_config = timeout_config or DEFAULT_TIMEOUT_CONFIG.copy()
        self.is_active = True
        
        # Validate agent specialties
        if not all(specialty in AGENT_TYPES for specialty in agent_data.specialties):
            raise ValueError(f"Invalid agent specialties: {agent_data.specialties}")
        
        self._logger = logging.getLogger(__name__)
        self._logger.info(f"Initialized {self.__class__.__name__} with specialties: {agent_data.specialties}")

    @abstractmethod
    async def process_message(
        self,
        message: str,
        chat_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Process incoming message and generate appropriate response.
        Must be implemented by specialized agents.
        
        Args:
            message: Input message text
            chat_id: Chat identifier
            metadata: Optional message metadata
            
        Returns:
            Processed response from the agent
            
        Raises:
            NotImplementedError: If not implemented by subclass
            asyncio.TimeoutError: If processing exceeds timeout
        """
        raise NotImplementedError("Specialized agents must implement process_message")

    async def generate_response(
        self,
        prompt: str,
        chat_id: str,
        context_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate and validate response using available AI services.
        
        Args:
            prompt: Input prompt for response generation
            chat_id: Chat identifier
            context_data: Optional additional context
            
        Returns:
            Generated and validated response
            
        Raises:
            asyncio.TimeoutError: If generation exceeds timeout
            RuntimeError: If response validation fails
        """
        start_time = datetime.now(timezone.utc)
        
        try:
            # Attempt LangChain response generation
            async with asyncio.timeout(self._timeout_config["response_timeout"]):
                response = await self.langchain_service.get_agent_response(
                    self.agent_data.specialties[0],
                    chat_id,
                    prompt,
                    context_data
                )
                
        except asyncio.TimeoutError:
            # Fallback to direct OpenAI completion
            self._logger.warning("LangChain timeout, falling back to OpenAI")
            response = await self.openai_service.generate_completion(prompt)
            AGENT_METRICS["error_count"].labels(error_type="langchain_timeout").inc()
        
        # Validate response
        is_valid, metrics = await self.validate_response(
            response,
            {"chat_id": chat_id, "context": context_data}
        )
        
        if not is_valid:
            self._logger.error("Response validation failed")
            raise RuntimeError("Failed to generate valid response")
            
        # Update metrics
        response_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        AGENT_METRICS["response_time"].observe(response_time)
        AGENT_METRICS["quality_score"].set(metrics.get("quality_score", 0))
        
        # Format response using template
        formatted_response = DEFAULT_RESPONSE_TEMPLATE.format(
            agent_name=self.agent_data.name,
            specialties=", ".join(self.agent_data.specialties),
            response=response
        )
        
        return formatted_response

    async def validate_response(
        self,
        response: str,
        validation_context: Dict[str, Any]
    ) -> Tuple[bool, Dict[str, float]]:
        """
        Validate response quality against defined thresholds.
        
        Args:
            response: Generated response text
            validation_context: Context for validation
            
        Returns:
            Tuple containing validation result and metrics
            
        Raises:
            asyncio.TimeoutError: If validation exceeds timeout
        """
        try:
            async with asyncio.timeout(self._timeout_config["validation_timeout"]):
                # Calculate confidence score
                confidence_score = await self.langchain_service._validate_response_quality(response)
                
                # Validate response format and content
                is_valid = (
                    confidence_score >= QUALITY_THRESHOLDS["min_confidence"] and
                    len(response.strip()) > 0 and
                    not any(phrase in response.lower() for phrase in ["i don't know", "cannot help"])
                )
                
                metrics = {
                    "quality_score": confidence_score,
                    "response_length": len(response)
                }
                
                AGENT_METRICS["validation_time"].observe(
                    self._timeout_config["validation_timeout"]
                )
                
                return is_valid, metrics
                
        except asyncio.TimeoutError:
            self._logger.warning("Response validation timeout")
            AGENT_METRICS["error_count"].labels(error_type="validation_timeout").inc()
            return False, {"quality_score": 0.0}

    async def update_context(
        self,
        chat_id: str,
        new_context: Dict[str, Any],
        coordination_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Update agent's context with new information.
        
        Args:
            chat_id: Chat identifier
            new_context: New context data
            coordination_data: Optional multi-agent coordination data
        """
        # Update conversation context
        self.context[chat_id] = {
            **self.context.get(chat_id, {}),
            **new_context,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        
        # Update coordination context if provided
        if coordination_data:
            self.coordination_context[chat_id] = {
                **self.coordination_context.get(chat_id, {}),
                **coordination_data
            }
        
        # Cleanup stale context
        current_time = datetime.now(timezone.utc)
        self.context = {
            chat_id: context
            for chat_id, context in self.context.items()
            if (current_time - datetime.fromisoformat(context["last_updated"])).total_seconds() < 3600
        }
        
        self._logger.debug(f"Updated context for chat {chat_id}")