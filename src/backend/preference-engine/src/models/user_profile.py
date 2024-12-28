"""
UserProfile Model for AI-Enhanced Group Chat Platform
Implements comprehensive user profile management with enhanced preference learning
and pattern analysis capabilities.

Version: 1.0.0
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, Any
from uuid import UUID, uuid4
import json
from pydantic import BaseModel, Field, validator  # v2.4+
from pymongo import MongoClient, ASCENDING, DESCENDING  # v4.5+

from ..config.settings import SUPPORTED_PREFERENCE_TYPES
from .preference import PreferenceModel

# Global constants for learning thresholds and analysis
LEARNING_THRESHOLDS = {
    "min_confidence": 0.6,
    "min_samples": 5,
    "pattern_weight": 0.3,
    "recency_weight": 0.4,
    "consistency_weight": 0.3
}

PROFILE_COLLECTION = "user_profiles"
PATTERN_ANALYSIS_WINDOW = "30d"

class UserProfile(BaseModel):
    """
    Comprehensive user profile model with enhanced preference learning and pattern analysis.
    Manages user-specific preferences, learning patterns, and personalization data.
    """
    profile_id: UUID = Field(default_factory=uuid4)
    user_id: UUID
    preferences: Dict[str, Dict] = Field(default_factory=dict)
    learning_patterns: Dict[str, Dict] = Field(default_factory=dict)
    interaction_history: Dict[str, List] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    confidence_scores: Dict[str, float] = Field(default_factory=dict)
    pattern_metrics: Dict[str, Dict] = Field(default_factory=dict)
    preference_categories: List[str] = Field(default=SUPPORTED_PREFERENCE_TYPES)

    def __init__(self, user_id: UUID, **data: Any):
        """
        Initialize a new user profile with enhanced tracking capabilities.
        
        Args:
            user_id: Unique identifier for the user
            **data: Additional profile data
        """
        super().__init__(user_id=user_id, **data)
        
        # Initialize preference structure for each supported type
        for pref_type in SUPPORTED_PREFERENCE_TYPES:
            if pref_type not in self.preferences:
                self.preferences[pref_type] = {}
                self.learning_patterns[pref_type] = {
                    "consistency_score": 0.0,
                    "temporal_patterns": {},
                    "preference_stability": 0.0
                }
                self.interaction_history[pref_type] = []
                self.confidence_scores[pref_type] = 0.0
                self.pattern_metrics[pref_type] = {
                    "last_analysis": datetime.utcnow(),
                    "sample_count": 0,
                    "pattern_strength": 0.0
                }

    async def update_preference(
        self,
        preference_type: str,
        preference_data: Dict,
        confidence_score: float,
        context_data: Optional[Dict] = None
    ) -> Dict:
        """
        Updates a specific preference category with enhanced pattern learning.
        
        Args:
            preference_type: Type of preference being updated
            preference_data: New preference data
            confidence_score: Confidence score for the update
            context_data: Optional contextual information
            
        Returns:
            Dict containing update status and metrics
            
        Raises:
            ValueError: If preference_type is invalid
        """
        if preference_type not in SUPPORTED_PREFERENCE_TYPES:
            raise ValueError(f"Invalid preference type: {preference_type}")

        # Create or update preference model
        pref_model = PreferenceModel(
            user_id=self.user_id,
            preference_type=preference_type
        )
        
        # Calculate pattern consistency
        pattern_score = self._calculate_pattern_consistency(
            preference_type,
            preference_data
        )
        
        # Update preference with weighted confidence
        weighted_confidence = (
            confidence_score * LEARNING_THRESHOLDS["pattern_weight"] +
            pattern_score * LEARNING_THRESHOLDS["consistency_weight"]
        )
        
        # Update preference data
        await pref_model.update_preference(
            preference_data,
            confidence_score=weighted_confidence
        )
        
        # Record interaction with context
        interaction_entry = {
            "timestamp": datetime.utcnow(),
            "data": preference_data,
            "confidence": weighted_confidence,
            "context": context_data or {}
        }
        self.interaction_history[preference_type].append(interaction_entry)
        
        # Update learning patterns
        self.learning_patterns[preference_type]["consistency_score"] = pattern_score
        self.confidence_scores[preference_type] = weighted_confidence
        self.last_updated = datetime.utcnow()
        
        # Trigger pattern analysis if threshold met
        if self.pattern_metrics[preference_type]["sample_count"] >= LEARNING_THRESHOLDS["min_samples"]:
            await self.analyze_learning_patterns(preference_type)
        
        return {
            "status": "success",
            "preference_type": preference_type,
            "confidence_score": weighted_confidence,
            "pattern_score": pattern_score,
            "updated_at": self.last_updated
        }

    async def analyze_learning_patterns(
        self,
        preference_type: str,
        analysis_options: Optional[Dict] = None
    ) -> Dict:
        """
        Performs comprehensive analysis of user's learning patterns.
        
        Args:
            preference_type: Type of preference to analyze
            analysis_options: Optional analysis configuration
            
        Returns:
            Dict containing detailed analysis results
        """
        if preference_type not in SUPPORTED_PREFERENCE_TYPES:
            raise ValueError(f"Invalid preference type: {preference_type}")
            
        # Get preference history within analysis window
        history = await self.get_preference_history(
            preference_type,
            start_date=datetime.utcnow() - timedelta(days=30)
        )
        
        # Calculate pattern metrics
        temporal_patterns = self._analyze_temporal_patterns(history)
        stability_score = self._calculate_preference_stability(history)
        confidence_interval = self._calculate_confidence_interval(history)
        
        # Update learning patterns
        self.learning_patterns[preference_type].update({
            "temporal_patterns": temporal_patterns,
            "preference_stability": stability_score,
            "confidence_interval": confidence_interval,
            "last_analysis": datetime.utcnow()
        })
        
        # Update pattern metrics
        self.pattern_metrics[preference_type].update({
            "sample_count": len(history),
            "pattern_strength": stability_score,
            "last_analysis": datetime.utcnow()
        })
        
        return {
            "preference_type": preference_type,
            "temporal_patterns": temporal_patterns,
            "stability_score": stability_score,
            "confidence_interval": confidence_interval,
            "sample_count": len(history),
            "analysis_timestamp": datetime.utcnow()
        }

    async def get_preference_history(
        self,
        preference_type: str,
        limit: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        filter_options: Optional[Dict] = None
    ) -> Dict:
        """
        Retrieves detailed preference history with enhanced filtering.
        
        Args:
            preference_type: Type of preference
            limit: Maximum number of entries
            start_date: Start date for filtering
            end_date: End date for filtering
            filter_options: Additional filtering options
            
        Returns:
            Dict containing filtered history and metrics
        """
        if preference_type not in SUPPORTED_PREFERENCE_TYPES:
            raise ValueError(f"Invalid preference type: {preference_type}")
            
        # Get base history
        history = self.interaction_history[preference_type]
        
        # Apply date filters
        if start_date or end_date:
            history = [
                entry for entry in history
                if (not start_date or entry["timestamp"] >= start_date) and
                   (not end_date or entry["timestamp"] <= end_date)
            ]
            
        # Apply custom filters
        if filter_options:
            for key, value in filter_options.items():
                history = [
                    entry for entry in history
                    if entry.get("context", {}).get(key) == value
                ]
                
        # Apply limit
        if limit:
            history = history[-limit:]
            
        return {
            "preference_type": preference_type,
            "history": history,
            "total_entries": len(history),
            "date_range": {
                "start": start_date or self.created_at,
                "end": end_date or datetime.utcnow()
            },
            "metrics": self.pattern_metrics[preference_type]
        }

    def _calculate_pattern_consistency(
        self,
        preference_type: str,
        new_data: Dict
    ) -> float:
        """
        Calculates consistency score for new preference data.
        
        Args:
            preference_type: Type of preference
            new_data: New preference data
            
        Returns:
            float: Consistency score between 0 and 1
        """
        if not self.interaction_history[preference_type]:
            return 0.5
            
        recent_entries = self.interaction_history[preference_type][-5:]
        consistency_count = sum(
            1 for entry in recent_entries
            if entry["data"] == new_data
        )
        
        return consistency_count / len(recent_entries)

    def _analyze_temporal_patterns(self, history: List[Dict]) -> Dict:
        """
        Analyzes temporal patterns in preference history.
        
        Args:
            history: List of historical preference entries
            
        Returns:
            Dict containing temporal pattern analysis
        """
        patterns = {
            "hourly": {},
            "daily": {},
            "weekly": {}
        }
        
        for entry in history:
            timestamp = entry["timestamp"]
            patterns["hourly"][timestamp.hour] = patterns["hourly"].get(timestamp.hour, 0) + 1
            patterns["daily"][timestamp.weekday()] = patterns["daily"].get(timestamp.weekday(), 0) + 1
            patterns["weekly"][timestamp.isocalendar()[1]] = patterns["weekly"].get(timestamp.isocalendar()[1], 0) + 1
            
        return patterns

    def _calculate_preference_stability(self, history: List[Dict]) -> float:
        """
        Calculates preference stability score.
        
        Args:
            history: List of historical preference entries
            
        Returns:
            float: Stability score between 0 and 1
        """
        if not history:
            return 0.0
            
        unique_values = len(set(json.dumps(entry["data"]) for entry in history))
        stability_score = 1 - (unique_values / len(history))
        
        return stability_score

    def _calculate_confidence_interval(self, history: List[Dict]) -> Dict:
        """
        Calculates confidence interval for preference data.
        
        Args:
            history: List of historical preference entries
            
        Returns:
            Dict containing confidence interval metrics
        """
        if not history:
            return {"lower": 0.0, "upper": 0.0, "mean": 0.0}
            
        confidence_scores = [entry["confidence"] for entry in history]
        mean_confidence = sum(confidence_scores) / len(confidence_scores)
        
        return {
            "lower": max(0.0, mean_confidence - 0.1),
            "upper": min(1.0, mean_confidence + 0.1),
            "mean": mean_confidence
        }

    class Config:
        """Pydantic model configuration"""
        arbitrary_types_allowed = True
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }