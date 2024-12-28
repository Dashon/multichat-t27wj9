"""
Preference Model for AI-Enhanced Group Chat Platform
Implements robust preference tracking with history management and confidence scoring.

Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Union
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, validator  # v2.4+
from pymongo import MongoClient, ASCENDING, DESCENDING  # v4.5+
from pymongo.errors import DuplicateKeyError

from ..config.settings import settings

# Global constants
PREFERENCE_TYPES = [
    "chat",           # Chat interface preferences
    "ai_agent",       # AI agent interaction preferences
    "ui",            # User interface customization
    "notification",   # Notification settings
    "language",       # Language and localization
    "accessibility",  # Accessibility settings
    "privacy"        # Privacy and data sharing
]

MAX_HISTORY_LENGTH = settings.PREFERENCE_HISTORY_LIMIT
MIN_CONFIDENCE_SCORE = 0.0
MAX_CONFIDENCE_SCORE = 1.0

class PreferenceHistoryEntry(BaseModel):
    """Model for tracking historical preference changes"""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: Dict = Field(...)
    confidence_score: float = Field(ge=MIN_CONFIDENCE_SCORE, le=MAX_CONFIDENCE_SCORE)
    version: int = Field(ge=0)

class PreferenceModel(BaseModel):
    """
    Comprehensive model for user preference management with history tracking
    and confidence scoring capabilities.
    """
    preference_id: UUID = Field(default_factory=uuid4)
    user_id: UUID = Field(...)
    preference_type: str = Field(...)
    preference_data: Dict = Field(default_factory=dict)
    history: List[PreferenceHistoryEntry] = Field(default_factory=list)
    confidence_score: float = Field(
        default=0.5,
        ge=MIN_CONFIDENCE_SCORE,
        le=MAX_CONFIDENCE_SCORE
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    version: int = Field(default=0)

    @validator('preference_type')
    def validate_preference_type(cls, v: str) -> str:
        """
        Validates the preference type against supported types.
        
        Args:
            v: Preference type to validate
            
        Returns:
            Validated preference type
            
        Raises:
            ValueError: If preference type is invalid
        """
        if v not in PREFERENCE_TYPES:
            raise ValueError(
                f"Invalid preference type. Must be one of: {', '.join(PREFERENCE_TYPES)}"
            )
        return v

    def update_preference(
        self,
        new_data: Dict,
        confidence_score: Optional[float] = None,
        force_update: bool = False
    ) -> bool:
        """
        Updates preference data with history tracking and confidence adjustment.
        
        Args:
            new_data: New preference data to store
            confidence_score: Optional new confidence score
            force_update: Whether to force update without version check
            
        Returns:
            bool: Success status of the update operation
        """
        # Create history entry before updating
        history_entry = PreferenceHistoryEntry(
            data=self.preference_data.copy(),
            confidence_score=self.confidence_score,
            version=self.version
        )
        
        # Manage history size using circular buffer
        if len(self.history) >= MAX_HISTORY_LENGTH:
            self.history.pop(0)
        self.history.append(history_entry)
        
        # Update preference data and metadata
        self.preference_data = new_data
        self.last_updated = datetime.utcnow()
        self.version += 1
        
        # Update confidence score if provided
        if confidence_score is not None:
            self.confidence_score = max(
                MIN_CONFIDENCE_SCORE,
                min(confidence_score, MAX_CONFIDENCE_SCORE)
            )
            
        return True

    def get_history(
        self,
        limit: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        min_confidence: Optional[float] = None
    ) -> List[PreferenceHistoryEntry]:
        """
        Retrieves filtered preference history with pagination.
        
        Args:
            limit: Maximum number of entries to return
            start_date: Start date for filtering
            end_date: End date for filtering
            min_confidence: Minimum confidence score filter
            
        Returns:
            List of filtered history entries
        """
        filtered_history = self.history.copy()
        
        # Apply date range filter
        if start_date or end_date:
            filtered_history = [
                entry for entry in filtered_history
                if (not start_date or entry.timestamp >= start_date) and
                   (not end_date or entry.timestamp <= end_date)
            ]
            
        # Apply confidence score filter
        if min_confidence is not None:
            filtered_history = [
                entry for entry in filtered_history
                if entry.confidence_score >= min_confidence
            ]
            
        # Apply pagination
        if limit:
            filtered_history = filtered_history[-limit:]
            
        return filtered_history

    @classmethod
    async def create_indexes(cls, db: MongoClient) -> None:
        """
        Creates required database indexes for efficient querying.
        
        Args:
            db: MongoDB client instance
        """
        await db[settings.PREFERENCE_COLLECTION].create_indexes([
            {
                'keys': [('user_id', ASCENDING), ('preference_type', ASCENDING)],
                'unique': True,
                'name': 'user_preference_type_idx'
            },
            {
                'keys': [('last_updated', DESCENDING)],
                'name': 'last_updated_idx'
            },
            {
                'keys': [('confidence_score', DESCENDING)],
                'name': 'confidence_score_idx'
            }
        ])

    class Config:
        """Pydantic model configuration"""
        arbitrary_types_allowed = True
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "user_id": "123e4567-e89b-12d3-a456-426614174000",
                "preference_type": "chat",
                "preference_data": {
                    "theme": "dark",
                    "font_size": "medium",
                    "notifications_enabled": True
                },
                "confidence_score": 0.8
            }
        }