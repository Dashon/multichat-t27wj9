"""
LangChain Service Module
Implements advanced AI capabilities using LangChain framework with enhanced monitoring and reliability.

Version: 1.0.0
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import json

# External imports with versions
from langchain import ConversationChain, Memory, PromptTemplate  # v0.0.335+
from langchain.memory import ConversationBufferWindowMemory  # v0.0.335+
from prometheus_client import Summary, Gauge, Counter  # v0.17+
from circuitbreaker import circuit  # v1.4+
from tenacity import retry, stop_after_attempt, wait_exponential  # v8.2.0+

# Internal imports
from .openai_service import OpenAIService
from ..context.context_manager import ContextManager
from ..models.agent import Agent, AGENT_TYPES

# Constants for agent prompts
AGENT_PROMPTS = {
    "explorer": """You are a travel and activities expert specializing in local exploration.
    Focus on providing detailed recommendations for attractions, activities, and transportation.
    Always consider accessibility, operating hours, and current local conditions.""",
    
    "foodie": """You are a restaurant and dining specialist with deep culinary knowledge.
    Provide detailed recommendations for dining experiences, considering cuisine types,
    dietary restrictions, price ranges, and local specialties.""",
    
    "planner": """You are an itinerary organization expert focused on efficient scheduling.
    Help coordinate group activities, manage time effectively, and create balanced schedules
    that accommodate different preferences and constraints.""",
    
    "budget": """You are a financial planning specialist for group activities.
    Provide cost-effective recommendations, track shared expenses, and help manage
    group budgets while maintaining quality experiences.""",
    
    "local": """You are a local area expert with deep knowledge of the community.
    Share cultural insights, safety tips, and insider knowledge about neighborhoods,
    events, and local customs."""
}

# Configuration constants
MEMORY_KEY = "chat_history"
MAX_MEMORY_ITEMS = 50
RESPONSE_TIMEOUT = 30  # seconds

# Prometheus metrics
RESPONSE_METRICS = {
    "RESPONSE_TIME": Summary("agent_response_time_seconds", "Time taken for agent response"),
    "RESPONSE_QUALITY": Gauge("agent_response_quality", "Quality score of agent response"),
    "MEMORY_USAGE": Gauge("agent_memory_usage_bytes", "Memory usage of agent chains")
}

class LangChainService:
    """
    Service class that manages LangChain-based AI agent interactions with enhanced monitoring
    and resource management capabilities.
    """

    def __init__(self, openai_service: OpenAIService, context_manager: ContextManager):
        """
        Initialize LangChain service with required dependencies and monitoring.

        Args:
            openai_service: OpenAI service instance for completions and embeddings
            context_manager: Context management service for conversations
        """
        self._openai_service = openai_service
        self._context_manager = context_manager
        self._agent_chains: Dict[str, ConversationChain] = {}
        self._logger = logging.getLogger(__name__)
        
        # Initialize metrics
        self._metrics = RESPONSE_METRICS
        self._request_counter = Counter(
            "agent_requests_total",
            "Total number of agent requests",
            ["agent_type"]
        )

    @circuit(failure_threshold=5, recovery_timeout=60)
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, max=10)
    )
    async def create_agent_chain(self, agent_type: str, chat_id: str) -> ConversationChain:
        """
        Creates a specialized conversation chain for an agent type with monitoring.

        Args:
            agent_type: Type of AI agent to create
            chat_id: Chat identifier for context management

        Returns:
            Configured conversation chain for the agent

        Raises:
            ValueError: If agent type is invalid
            RuntimeError: If chain creation fails
        """
        if agent_type not in AGENT_TYPES:
            raise ValueError(f"Invalid agent type: {agent_type}")

        try:
            # Create memory component with window buffer
            memory = ConversationBufferWindowMemory(
                memory_key=MEMORY_KEY,
                k=MAX_MEMORY_ITEMS,
                return_messages=True
            )

            # Configure prompt template with agent specialization
            prompt_template = PromptTemplate(
                input_variables=["history", "input"],
                template=f"{AGENT_PROMPTS[agent_type]}\n\nConversation History:\n{{history}}\n\nHuman: {{input}}\nAssistant:"
            )

            # Create conversation chain
            chain = ConversationChain(
                llm=self._openai_service,
                memory=memory,
                prompt=prompt_template,
                verbose=True
            )

            # Store chain reference
            chain_key = f"{chat_id}:{agent_type}"
            self._agent_chains[chain_key] = chain
            
            # Update memory usage metrics
            self._metrics["MEMORY_USAGE"].inc()
            
            self._logger.info(f"Created agent chain for type {agent_type} in chat {chat_id}")
            return chain

        except Exception as e:
            self._logger.error(f"Failed to create agent chain: {str(e)}")
            raise RuntimeError(f"Agent chain creation failed: {str(e)}")

    @circuit(failure_threshold=5, recovery_timeout=60)
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, max=10)
    )
    async def get_agent_response(
        self,
        agent_type: str,
        chat_id: str,
        message: str,
        context_options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generates a response using the appropriate agent chain with quality validation.

        Args:
            agent_type: Type of AI agent to use
            chat_id: Chat identifier
            message: User message to process
            context_options: Optional context retrieval parameters

        Returns:
            Agent's response to the message

        Raises:
            ValueError: If input parameters are invalid
            RuntimeError: If response generation fails
        """
        try:
            # Get or create agent chain
            chain_key = f"{chat_id}:{agent_type}"
            if chain_key not in self._agent_chains:
                chain = await self.create_agent_chain(agent_type, chat_id)
            else:
                chain = self._agent_chains[chain_key]

            # Track request metrics
            self._request_counter.labels(agent_type=agent_type).inc()

            # Get relevant context
            context = await self._context_manager.get_relevant_context(
                chat_id,
                message,
                context_options
            )

            # Prepare enhanced context
            enhanced_message = self._prepare_context_message(message, context)

            # Generate response with timing
            with self._metrics["RESPONSE_TIME"].time():
                response = await asyncio.wait_for(
                    chain.apredict(input=enhanced_message),
                    timeout=RESPONSE_TIMEOUT
                )

            # Validate response quality
            quality_score = await self._validate_response_quality(response)
            self._metrics["RESPONSE_QUALITY"].set(quality_score)

            # Update context
            await self._context_manager.add_message_to_context(
                chat_id,
                {
                    "message_id": str(datetime.utcnow().timestamp()),
                    "sender_id": f"agent:{agent_type}",
                    "content": response,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )

            self._logger.info(
                f"Generated response for {agent_type} in chat {chat_id} "
                f"with quality score {quality_score}"
            )
            return response

        except asyncio.TimeoutError:
            self._logger.error(f"Response generation timed out for {agent_type}")
            raise RuntimeError("Response generation timed out")
        except Exception as e:
            self._logger.error(f"Failed to generate response: {str(e)}")
            raise

    async def update_agent_memory(
        self,
        agent_type: str,
        chat_id: str,
        message_data: Dict[str, Any]
    ) -> None:
        """
        Updates the memory of an agent's conversation chain.

        Args:
            agent_type: Type of AI agent
            chat_id: Chat identifier
            message_data: Message data to add to memory

        Raises:
            ValueError: If message data is invalid
            RuntimeError: If memory update fails
        """
        try:
            chain_key = f"{chat_id}:{agent_type}"
            if chain_key not in self._agent_chains:
                return

            chain = self._agent_chains[chain_key]
            
            # Format message for memory
            formatted_message = {
                "role": "human" if message_data.get("is_user", True) else "assistant",
                "content": message_data["content"]
            }

            # Update chain memory
            await chain.memory.save_context(
                {"input": message_data["content"]},
                {"output": ""}
            )

            # Update memory usage metrics
            self._metrics["MEMORY_USAGE"].set(len(chain.memory.buffer))

        except Exception as e:
            self._logger.error(f"Failed to update agent memory: {str(e)}")
            raise RuntimeError(f"Memory update failed: {str(e)}")

    async def cleanup_agent_chains(self) -> None:
        """
        Removes inactive agent chains to free resources with monitoring.
        """
        try:
            inactive_chains = []
            current_time = datetime.utcnow()

            for chain_key, chain in self._agent_chains.items():
                # Check last activity time from memory
                if chain.memory.buffer:
                    last_interaction = chain.memory.buffer[-1].get("timestamp")
                    if last_interaction:
                        last_time = datetime.fromisoformat(last_interaction)
                        if (current_time - last_time).hours > 24:
                            inactive_chains.append(chain_key)

            # Cleanup inactive chains
            for chain_key in inactive_chains:
                del self._agent_chains[chain_key]
                self._metrics["MEMORY_USAGE"].dec()

            self._logger.info(f"Cleaned up {len(inactive_chains)} inactive agent chains")

        except Exception as e:
            self._logger.error(f"Failed to cleanup agent chains: {str(e)}")

    def _prepare_context_message(self, message: str, context: List[Dict]) -> str:
        """
        Prepares enhanced message with relevant context.

        Args:
            message: Original message
            context: Relevant context messages

        Returns:
            Enhanced message with context
        """
        context_str = "\n".join([
            f"{msg['sender_id']}: {msg['content']}"
            for msg in context
        ])
        return f"Context:\n{context_str}\n\nCurrent message: {message}"

    async def _validate_response_quality(self, response: str) -> float:
        """
        Validates the quality of agent response.

        Args:
            response: Generated response text

        Returns:
            Quality score between 0 and 1
        """
        # Implement response quality validation logic
        # This is a placeholder implementation
        return 0.9 if len(response) > 50 else 0.7