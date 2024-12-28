"""
Planner Agent Module
Implements a specialized AI agent focused on itinerary organization, time management,
and group coordination with enhanced performance and monitoring capabilities.

Version: 1.0.0
"""

from typing import Dict, Any, Optional, Tuple  # v3.11+
from dataclasses import dataclass  # v3.11+
import asyncio  # v3.11+
import logging
from datetime import datetime, timezone
import json

# Internal imports
from agents.base_agent import BaseAgent
from services.langchain_service import LangChainService
from services.openai_service import OpenAIService

# Constants for configuration
PLANNER_PROMPT_TEMPLATE = """As a planning specialist, I'll help organize {activity_type}.
Current context: {context}
Group preferences: {preferences}
How can I assist with {request_type}?"""

SUPPORTED_ACTIVITIES = [
    "itinerary", "schedule", "meeting", "event", 
    "task", "timeline", "coordination", "planning"
]

TIMEOUT_SECONDS = 2.0
MAX_RETRIES = 3
CACHE_EXPIRY_HOURS = 24

@dataclass
class PlannerAgent(BaseAgent):
    """
    Enhanced specialized AI agent for planning and organizing group activities.
    
    Attributes:
        activity_cache: Cache for recently processed activities
        group_preferences: Stored group preferences with weights
        chat_locks: Concurrency control for chat operations
        retry_counts: Track retry attempts per chat
        performance_metrics: Monitor agent performance
    """

    activity_cache: Dict[str, Any]
    group_preferences: Dict[str, Dict[str, float]]
    chat_locks: Dict[str, asyncio.Lock]
    retry_counts: Dict[str, int]
    performance_metrics: Dict[str, float]

    def __init__(
        self,
        agent_data: 'Agent',
        langchain_service: LangChainService,
        openai_service: OpenAIService
    ):
        """Initialize planner agent with enhanced capabilities."""
        super().__init__(agent_data, langchain_service, openai_service)
        
        self.activity_cache = {}
        self.group_preferences = {}
        self.chat_locks = {}
        self.retry_counts = {}
        self.performance_metrics = {
            'avg_response_time': 0.0,
            'success_rate': 100.0,
            'cache_hit_rate': 0.0
        }
        
        self._logger = logging.getLogger(__name__)
        self._logger.info("PlannerAgent initialized with enhanced capabilities")

    async def async_process_message(
        self,
        message: str,
        chat_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Process incoming messages with timeout control and enhanced error handling.
        
        Args:
            message: Input message text
            chat_id: Chat identifier
            metadata: Optional message metadata
            
        Returns:
            Planning-focused response or recommendation
            
        Raises:
            asyncio.TimeoutError: If processing exceeds timeout
            RuntimeError: If processing fails after retries
        """
        # Ensure chat lock exists
        if chat_id not in self.chat_locks:
            self.chat_locks[chat_id] = asyncio.Lock()
            
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.chat_locks[chat_id]:
                # Analyze message for planning context
                activity_type, confidence = await self.analyze_activity_type(
                    message,
                    metadata or {}
                )
                
                if confidence < 0.7:
                    return "I'm not sure how to help with that. Could you provide more details about what you'd like to plan?"
                
                # Get or initialize group preferences
                preferences = self.group_preferences.get(chat_id, {})
                
                # Generate planning suggestion with timeout
                async with asyncio.timeout(TIMEOUT_SECONDS):
                    suggestion = await self.async_generate_planning_suggestion(
                        activity_type,
                        chat_id,
                        preferences,
                        TIMEOUT_SECONDS
                    )
                
                # Update performance metrics
                duration = (datetime.now(timezone.utc) - start_time).total_seconds()
                self.performance_metrics['avg_response_time'] = (
                    0.9 * self.performance_metrics['avg_response_time'] + 0.1 * duration
                )
                
                return suggestion
                
        except asyncio.TimeoutError:
            self._logger.error(f"Processing timeout for chat {chat_id}")
            self.retry_counts[chat_id] = self.retry_counts.get(chat_id, 0) + 1
            
            if self.retry_counts[chat_id] >= MAX_RETRIES:
                self.performance_metrics['success_rate'] -= 1
                raise RuntimeError("Maximum retries exceeded")
                
            return "I'm taking longer than expected. Let me try to simplify my response."
            
        except Exception as e:
            self._logger.error(f"Error processing message: {str(e)}")
            self.performance_metrics['success_rate'] -= 0.5
            raise

    async def analyze_activity_type(
        self,
        message: str,
        context: Dict[str, Any]
    ) -> Tuple[str, float]:
        """
        Enhanced analysis of message to determine activity type with confidence scoring.
        
        Args:
            message: Input message text
            context: Additional context data
            
        Returns:
            Tuple of activity type and confidence score
        """
        try:
            # Generate embedding for message
            message_embedding = await self.openai_service.generate_embedding(message)
            
            # Check against supported activities
            max_confidence = 0.0
            best_match = SUPPORTED_ACTIVITIES[0]
            
            for activity in SUPPORTED_ACTIVITIES:
                if activity.lower() in message.lower():
                    confidence = 0.9
                    if context.get('recent_activities', []):
                        # Boost confidence if activity type matches recent context
                        if activity in context['recent_activities']:
                            confidence = 0.95
                    return activity, confidence
                    
                # Fallback to embedding similarity
                activity_embedding = await self.openai_service.generate_embedding(activity)
                similarity = np.dot(message_embedding, activity_embedding)
                
                if similarity > max_confidence:
                    max_confidence = similarity
                    best_match = activity
            
            return best_match, max_confidence
            
        except Exception as e:
            self._logger.error(f"Error analyzing activity type: {str(e)}")
            return "general", 0.5

    async def async_generate_planning_suggestion(
        self,
        activity_type: str,
        chat_id: str,
        preferences: Dict[str, Any],
        timeout: float
    ) -> str:
        """
        Asynchronously generate optimized planning suggestions with caching.
        
        Args:
            activity_type: Type of activity to plan
            chat_id: Chat identifier
            preferences: Group preferences
            timeout: Operation timeout
            
        Returns:
            Optimized planning suggestion
        """
        cache_key = f"{chat_id}:{activity_type}"
        
        # Check cache first
        if cache_key in self.activity_cache:
            cache_entry = self.activity_cache[cache_key]
            cache_age = (datetime.now(timezone.utc) - cache_entry['timestamp']).total_seconds()
            
            if cache_age < CACHE_EXPIRY_HOURS * 3600:
                self.performance_metrics['cache_hit_rate'] += 0.1
                return cache_entry['suggestion']
        
        try:
            # Prepare enhanced context
            context = await self.langchain_service.get_relevant_context(
                chat_id,
                activity_type,
                {'limit': 5}
            )
            
            # Generate suggestion using template
            prompt = PLANNER_PROMPT_TEMPLATE.format(
                activity_type=activity_type,
                context=json.dumps(context),
                preferences=json.dumps(preferences),
                request_type="suggestion"
            )
            
            async with asyncio.timeout(timeout):
                suggestion = await self.generate_response(prompt, chat_id)
                
                # Cache successful suggestion
                self.activity_cache[cache_key] = {
                    'suggestion': suggestion,
                    'timestamp': datetime.now(timezone.utc)
                }
                
                return suggestion
                
        except Exception as e:
            self._logger.error(f"Error generating suggestion: {str(e)}")
            raise

    async def update_group_preferences(
        self,
        chat_id: str,
        new_preferences: Dict[str, Any],
        force_update: bool = False
    ) -> bool:
        """
        Update and optimize stored group preferences with validation.
        
        Args:
            chat_id: Chat identifier
            new_preferences: New preference data
            force_update: Force preference update
            
        Returns:
            Update success status
        """
        try:
            if chat_id not in self.group_preferences or force_update:
                self.group_preferences[chat_id] = {}
            
            # Validate and normalize preferences
            for key, value in new_preferences.items():
                if isinstance(value, (int, float)) and 0 <= value <= 1:
                    self.group_preferences[chat_id][key] = value
                    
            # Remove old preferences
            current_time = datetime.now(timezone.utc)
            self.group_preferences[chat_id] = {
                k: v for k, v in self.group_preferences[chat_id].items()
                if k in new_preferences
            }
            
            return True
            
        except Exception as e:
            self._logger.error(f"Error updating preferences: {str(e)}")
            return False

    async def cleanup_resources(self) -> Dict[str, Any]:
        """
        Perform resource cleanup and optimization.
        
        Returns:
            Cleanup statistics
        """
        cleanup_stats = {
            'cache_entries_removed': 0,
            'locks_cleared': 0,
            'preferences_cleaned': 0
        }
        
        try:
            # Cleanup expired cache entries
            current_time = datetime.now(timezone.utc)
            expired_cache = []
            
            for key, entry in self.activity_cache.items():
                if (current_time - entry['timestamp']).total_seconds() > CACHE_EXPIRY_HOURS * 3600:
                    expired_cache.append(key)
                    
            for key in expired_cache:
                del self.activity_cache[key]
            cleanup_stats['cache_entries_removed'] = len(expired_cache)
            
            # Clear unused locks
            self.chat_locks = {
                chat_id: lock
                for chat_id, lock in self.chat_locks.items()
                if not lock.locked()
            }
            cleanup_stats['locks_cleared'] = len(self.chat_locks)
            
            # Reset retry counts
            self.retry_counts.clear()
            
            return cleanup_stats
            
        except Exception as e:
            self._logger.error(f"Error during cleanup: {str(e)}")
            return cleanup_stats