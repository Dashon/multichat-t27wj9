"""
Foodie Agent Module
Implements specialized AI agent for restaurant recommendations and dining expertise
with enhanced context awareness and performance optimizations.

Version: 1.0.0
"""

from typing import Dict, List, Any, Optional  # v3.11+
from dataclasses import dataclass  # v3.11+
import asyncio  # v3.11+
import aiohttp  # v3.8+
from datetime import datetime, timezone
import logging
from prometheus_client import Summary, Counter, Gauge  # v0.17+

# Internal imports
from agents.base_agent import BaseAgent
from models.agent import Agent

# Constants
CUISINE_CATEGORIES = [
    "Italian", "Japanese", "Chinese", "Indian", "Mexican", 
    "French", "Thai", "Mediterranean", "American", "Korean"
]

DIETARY_RESTRICTIONS = [
    "vegetarian", "vegan", "gluten-free", "halal", 
    "kosher", "dairy-free", "nut-free", "pescatarian"
]

# Metrics
FOODIE_METRICS = {
    "recommendation_time": Summary(
        "foodie_recommendation_seconds", 
        "Time taken for restaurant recommendations"
    ),
    "preference_updates": Counter(
        "foodie_preference_updates_total", 
        "Total preference updates"
    ),
    "recommendation_quality": Gauge(
        "foodie_recommendation_quality", 
        "Quality score of recommendations"
    )
}

@dataclass
class FoodieAgent(BaseAgent):
    """
    Specialized AI agent for restaurant recommendations and dining expertise
    with enhanced context awareness and performance optimizations.
    """

    def __init__(
        self,
        agent_data: Agent,
        langchain_service: Any,
        openai_service: Any,
        cache_ttl_seconds: int = 3600,
        max_retries: int = 3,
        timeout_seconds: float = 5.0
    ):
        """
        Initialize foodie agent with specialized capabilities.

        Args:
            agent_data: Agent configuration data
            langchain_service: LangChain service instance
            openai_service: OpenAI service instance
            cache_ttl_seconds: Cache time-to-live in seconds
            max_retries: Maximum retry attempts
            timeout_seconds: Operation timeout in seconds
        """
        super().__init__(agent_data, langchain_service, openai_service)
        
        # Initialize specialized data structures
        self.cuisine_preferences: Dict[str, Dict[str, List[str]]] = {
            "user": {},    # User-specific preferences
            "group": {}    # Aggregated group preferences
        }
        
        self.dietary_restrictions: Dict[str, Dict[str, List[str]]] = {
            "user": {},    # User-specific restrictions
            "group": {}    # Aggregated group restrictions
        }
        
        self.restaurant_history: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self.recommendation_scores: Dict[str, float] = {}
        self.last_updated: Dict[str, datetime] = {}
        
        # Performance settings
        self.cache_ttl_seconds = cache_ttl_seconds
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        
        # Initialize HTTP client session
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=timeout_seconds)
        )
        
        self._logger = logging.getLogger(__name__)
        self._logger.info("FoodieAgent initialized with enhanced capabilities")

    async def process_message(
        self,
        message: str,
        chat_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Process incoming messages for restaurant and dining related queries.

        Args:
            message: Input message text
            chat_id: Chat identifier
            metadata: Optional message metadata

        Returns:
            Restaurant recommendation or dining-related response
        """
        start_time = datetime.now(timezone.utc)
        
        try:
            # Validate input
            if not message or not chat_id:
                raise ValueError("Invalid message or chat_id")

            # Extract dining preferences from message
            preferences = await self._extract_preferences(message)
            
            # Update user context asynchronously
            if metadata and "user_id" in metadata:
                asyncio.create_task(
                    self.async_update_preferences(
                        chat_id,
                        metadata["user_id"],
                        preferences
                    )
                )

            # Check cache for recent similar recommendations
            cache_key = f"{chat_id}:{hash(message)}"
            if cache_key in self.recommendation_scores:
                if (datetime.now(timezone.utc) - self.last_updated[cache_key]).seconds < self.cache_ttl_seconds:
                    return await self.generate_response(
                        "Based on recent recommendations: " + message,
                        chat_id
                    )

            # Generate restaurant recommendation
            async with asyncio.timeout(self.timeout_seconds):
                if "location" in metadata:
                    recommendation = await self.async_get_restaurant_recommendation(
                        chat_id,
                        metadata["location"],
                        preferences
                    )
                    response = self._format_recommendation(recommendation)
                else:
                    response = await self.generate_response(message, chat_id)

            # Update metrics
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            FOODIE_METRICS["recommendation_time"].observe(duration)
            
            return response

        except asyncio.TimeoutError:
            self._logger.error("Recommendation generation timed out")
            return "I apologize, but I'm having trouble processing your request right now. Please try again."
        except Exception as e:
            self._logger.error(f"Error processing message: {str(e)}")
            return "I apologize, but I encountered an error processing your request."

    async def async_update_preferences(
        self,
        chat_id: str,
        user_id: str,
        preferences: Dict[str, Any]
    ) -> bool:
        """
        Asynchronously update user's cuisine preferences and dietary restrictions.

        Args:
            chat_id: Chat identifier
            user_id: User identifier
            preferences: Updated preferences

        Returns:
            Success status of update operation
        """
        try:
            # Validate preferences
            if not self._validate_preferences(preferences):
                return False

            # Update cuisine preferences
            if "cuisines" in preferences:
                if chat_id not in self.cuisine_preferences["user"]:
                    self.cuisine_preferences["user"][chat_id] = {}
                self.cuisine_preferences["user"][chat_id][user_id] = preferences["cuisines"]

            # Update dietary restrictions
            if "dietary_restrictions" in preferences:
                if chat_id not in self.dietary_restrictions["user"]:
                    self.dietary_restrictions["user"][chat_id] = {}
                self.dietary_restrictions["user"][chat_id][user_id] = preferences["dietary_restrictions"]

            # Update group aggregates
            await self._update_group_preferences(chat_id)

            # Update context
            await self.update_context(
                chat_id,
                {
                    "preferences": preferences,
                    "last_updated": datetime.now(timezone.utc).isoformat()
                }
            )

            FOODIE_METRICS["preference_updates"].inc()
            return True

        except Exception as e:
            self._logger.error(f"Error updating preferences: {str(e)}")
            return False

    async def async_get_restaurant_recommendation(
        self,
        chat_id: str,
        location: str,
        criteria: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Asynchronously generate personalized restaurant recommendations.

        Args:
            chat_id: Chat identifier
            location: Location for recommendations
            criteria: Search criteria and preferences

        Returns:
            Restaurant recommendation details
        """
        try:
            # Validate location and criteria
            if not location or not criteria:
                raise ValueError("Invalid location or criteria")

            # Aggregate group dietary restrictions
            group_restrictions = set()
            if chat_id in self.dietary_restrictions["group"]:
                group_restrictions.update(self.dietary_restrictions["group"][chat_id])

            # Match cuisine preferences with weights
            cuisine_weights = self._calculate_cuisine_weights(chat_id)

            # Generate recommendation prompt
            prompt = self._build_recommendation_prompt(
                location,
                criteria,
                cuisine_weights,
                group_restrictions
            )

            # Generate recommendations with retry logic
            for attempt in range(self.max_retries):
                try:
                    async with asyncio.timeout(self.timeout_seconds):
                        response = await self.generate_response(prompt, chat_id)
                        recommendation = self._parse_recommendation(response)
                        
                        if self._validate_recommendation(recommendation):
                            # Update recommendation history
                            if chat_id not in self.restaurant_history:
                                self.restaurant_history[chat_id] = {}
                            self.restaurant_history[chat_id][recommendation["name"]] = {
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "score": recommendation.get("score", 0.0)
                            }
                            
                            return recommendation
                except asyncio.TimeoutError:
                    if attempt == self.max_retries - 1:
                        raise
                    await asyncio.sleep(1)

            raise RuntimeError("Failed to generate valid recommendation")

        except Exception as e:
            self._logger.error(f"Error generating recommendation: {str(e)}")
            raise

    async def _extract_preferences(self, message: str) -> Dict[str, Any]:
        """Extract dining preferences from message using NLP."""
        try:
            preferences = await self.langchain_service.get_agent_response(
                "foodie",
                "preference_extraction",
                message
            )
            return self._parse_preferences(preferences)
        except Exception as e:
            self._logger.error(f"Error extracting preferences: {str(e)}")
            return {}

    def _validate_preferences(self, preferences: Dict[str, Any]) -> bool:
        """Validate preference data structure and values."""
        if "cuisines" in preferences:
            if not all(cuisine in CUISINE_CATEGORIES for cuisine in preferences["cuisines"]):
                return False
        if "dietary_restrictions" in preferences:
            if not all(restriction in DIETARY_RESTRICTIONS for restriction in preferences["dietary_restrictions"]):
                return False
        return True

    async def _update_group_preferences(self, chat_id: str) -> None:
        """Update aggregated group preferences and restrictions."""
        # Update cuisine preferences
        if chat_id in self.cuisine_preferences["user"]:
            all_cuisines = []
            for user_prefs in self.cuisine_preferences["user"][chat_id].values():
                all_cuisines.extend(user_prefs)
            self.cuisine_preferences["group"][chat_id] = list(set(all_cuisines))

        # Update dietary restrictions
        if chat_id in self.dietary_restrictions["user"]:
            all_restrictions = []
            for user_restrictions in self.dietary_restrictions["user"][chat_id].values():
                all_restrictions.extend(user_restrictions)
            self.dietary_restrictions["group"][chat_id] = list(set(all_restrictions))

    def _calculate_cuisine_weights(self, chat_id: str) -> Dict[str, float]:
        """Calculate weighted preferences for cuisines based on group history."""
        weights = {cuisine: 1.0 for cuisine in CUISINE_CATEGORIES}
        if chat_id in self.cuisine_preferences["group"]:
            for cuisine in self.cuisine_preferences["group"][chat_id]:
                weights[cuisine] *= 1.5
        return weights

    async def close(self) -> None:
        """Cleanup resources and close connections."""
        if self._session:
            await self._session.close()