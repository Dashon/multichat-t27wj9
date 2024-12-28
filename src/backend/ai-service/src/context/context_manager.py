"""
Context Manager Module
Provides comprehensive context lifecycle management for AI agents with production-grade features.

Version: 1.0.0
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
import numpy as np
from prometheus_client import Counter, Histogram, Gauge
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from .vector_store import VectorStore
from ..models.context import (
    Context,
    MAX_SHORT_TERM_MESSAGES,
    MAX_CONTEXT_AGE_HOURS,
    EMBEDDING_DIMENSION
)
from ..services.openai_service import OpenAIService

# Constants for configuration
SIMILARITY_THRESHOLD = 0.7
MAX_RELEVANT_CONTEXTS = 5
BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 1
CONNECTION_TIMEOUT_SECONDS = 5

# Initialize metrics
CONTEXT_OPS = Counter('context_operations_total', 'Total context operations', ['operation'])
CONTEXT_LATENCY = Histogram('context_operation_latency_seconds', 'Context operation latency')
ACTIVE_CONTEXTS = Gauge('active_contexts_total', 'Number of active contexts')

class ContextManager:
    """
    Manages conversation context lifecycle with enhanced reliability and performance features.
    Implements comprehensive context management including short-term and long-term memory.
    """

    def __init__(
        self,
        vector_store: VectorStore,
        openai_service: OpenAIService,
        config: Dict[str, Any]
    ):
        """
        Initialize context manager with enhanced features.

        Args:
            vector_store: Vector database interface
            openai_service: OpenAI service interface
            config: Configuration dictionary
        """
        self._active_contexts: Dict[str, Context] = {}
        self._vector_store = vector_store
        self._openai_service = openai_service
        self._config = config
        self._logger = logging.getLogger(__name__)
        
        # Initialize background cleanup task
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
        
        self._logger.info("Context Manager initialized with enhanced features")

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY_SECONDS),
        retry_if_exception_type=(ConnectionError, TimeoutError)
    )
    async def add_message_to_context(
        self,
        chat_id: str,
        message: Dict[str, Any],
        batch_mode: bool = False
    ) -> None:
        """
        Add message to context with enhanced reliability and batch processing.

        Args:
            chat_id: Chat identifier
            message: Message data dictionary
            batch_mode: Enable batch processing mode
        """
        try:
            with CONTEXT_LATENCY.time():
                # Get or create context
                context = self._get_or_create_context(chat_id)
                
                # Add message to context
                context.add_message(message)
                
                # Generate embedding
                embedding = await self._openai_service.generate_embedding(
                    message['content']
                )
                
                # Store embedding
                await self._vector_store.store_embedding(
                    message['message_id'],
                    chat_id,
                    embedding,
                    batch_mode
                )
                
                # Update context embeddings
                context.update_embeddings(message['message_id'], embedding)
                
                CONTEXT_OPS.labels(operation='add_message').inc()
                ACTIVE_CONTEXTS.set(len(self._active_contexts))
                
        except Exception as e:
            self._logger.error(f"Error adding message to context: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY_SECONDS)
    )
    async def get_relevant_context(
        self,
        chat_id: str,
        query: str,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant context with enhanced performance and reliability.

        Args:
            chat_id: Chat identifier
            query: Query text
            options: Optional parameters

        Returns:
            List of relevant context messages
        """
        try:
            with CONTEXT_LATENCY.time():
                # Generate query embedding
                query_embedding = await self._openai_service.generate_embedding(query)
                
                # Search similar vectors
                similar_messages = await self._vector_store.search_similar(
                    query_embedding,
                    chat_id,
                    limit=options.get('limit', MAX_RELEVANT_CONTEXTS),
                    score_threshold=options.get('threshold', SIMILARITY_THRESHOLD)
                )
                
                # Get context messages
                context = self._get_or_create_context(chat_id)
                messages = []
                
                for similar in similar_messages:
                    message_id = similar['message_id']
                    for msg in context.short_term_memory:
                        if msg['message_id'] == message_id:
                            messages.append({
                                **msg,
                                'relevance_score': similar['score']
                            })
                            break
                
                CONTEXT_OPS.labels(operation='get_context').inc()
                return messages
                
        except Exception as e:
            self._logger.error(f"Error retrieving relevant context: {str(e)}")
            raise

    async def get_group_dynamics(
        self,
        chat_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Get enhanced group dynamics analysis with performance optimization.

        Args:
            chat_id: Chat identifier
            options: Optional parameters

        Returns:
            Group dynamics metrics dictionary
        """
        try:
            with CONTEXT_LATENCY.time():
                context = self._get_or_create_context(chat_id)
                
                dynamics = {
                    'participation_metrics': context.group_dynamics['participation_metrics'],
                    'avg_response_times': {},
                    'interaction_strength': {},
                    'active_users': len(context.group_dynamics['participation_metrics']),
                    'total_messages': sum(
                        context.group_dynamics['participation_metrics'].values()
                    )
                }
                
                # Calculate average response times
                for user_id, times in context.group_dynamics['response_times'].items():
                    if times:
                        dynamics['avg_response_times'][user_id] = sum(times) / len(times)
                
                # Calculate interaction strength
                total_interactions = sum(
                    context.group_dynamics['interaction_pairs'].values()
                )
                if total_interactions > 0:
                    dynamics['interaction_strength'] = {
                        pair: count / total_interactions
                        for pair, count in context.group_dynamics['interaction_pairs'].items()
                    }
                
                CONTEXT_OPS.labels(operation='get_dynamics').inc()
                return dynamics
                
        except Exception as e:
            self._logger.error(f"Error analyzing group dynamics: {str(e)}")
            raise

    async def _periodic_cleanup(self) -> None:
        """
        Periodic cleanup of stale contexts with efficient resource management.
        """
        while True:
            try:
                await asyncio.sleep(3600)  # Run hourly
                
                with CONTEXT_LATENCY.time():
                    stale_contexts = [
                        chat_id
                        for chat_id, context in self._active_contexts.items()
                        if context.is_stale()
                    ]
                    
                    for chat_id in stale_contexts:
                        del self._active_contexts[chat_id]
                    
                    ACTIVE_CONTEXTS.set(len(self._active_contexts))
                    CONTEXT_OPS.labels(operation='cleanup').inc()
                    
                    self._logger.info(f"Cleaned up {len(stale_contexts)} stale contexts")
                    
            except Exception as e:
                self._logger.error(f"Error in context cleanup: {str(e)}")

    def _get_or_create_context(self, chat_id: str) -> Context:
        """
        Get existing context or create new one.

        Args:
            chat_id: Chat identifier

        Returns:
            Context instance
        """
        if chat_id not in self._active_contexts:
            self._active_contexts[chat_id] = Context(chat_id)
            ACTIVE_CONTEXTS.set(len(self._active_contexts))
        return self._active_contexts[chat_id]

    async def close(self) -> None:
        """
        Cleanup resources and close connections.
        """
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        self._active_contexts.clear()
        ACTIVE_CONTEXTS.set(0)
        self._logger.info("Context Manager shutdown complete")