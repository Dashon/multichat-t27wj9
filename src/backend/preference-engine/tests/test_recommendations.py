"""
Comprehensive test suite for the recommendation service functionality.
Validates recommendation generation, scoring algorithms, group dynamics,
and performance metrics.

Version: 1.0.0
"""

import pytest  # v7.4+
import pytest_asyncio  # v0.21+
from unittest.mock import AsyncMock, MagicMock, patch  # v3.11+
import asyncio
from datetime import datetime, timedelta
from uuid import UUID, uuid4
import json

from ..src.services.recommendation_service import (
    RecommendationService,
    calculate_recommendation_score,
    SCORE_WEIGHTS,
    MIN_CONFIDENCE_SCORE,
    MAX_RECOMMENDATIONS
)

# Test constants
TEST_USER_ID = UUID('123e4567-e89b-12d3-a456-426614174000')
TEST_GROUP_ID = UUID('987fcdeb-89ab-12de-f456-426614174000')
MOCK_CACHE_CONFIG = {
    'host': 'localhost',
    'port': 6379,
    'db': 0,
    'timeout': 1.0
}

class TestRecommendationService:
    """Comprehensive test class for recommendation service functionality."""
    
    @pytest.fixture(autouse=True)
    async def setup(self):
        """Setup test environment with mocked dependencies."""
        # Mock MongoDB client
        self.mock_db = AsyncMock()
        self.mock_db.preferences = AsyncMock()
        self.mock_db.user_profiles = AsyncMock()
        
        # Mock Redis cache
        self.mock_cache = AsyncMock()
        self.mock_cache.get = AsyncMock(return_value=None)
        self.mock_cache.setex = AsyncMock(return_value=True)
        
        # Mock learning service
        self.mock_learning_service = AsyncMock()
        
        # Initialize service with mocks
        self.service = RecommendationService(
            learning_service=self.mock_learning_service,
            cache_config=MOCK_CACHE_CONFIG
        )
        self.service._cache = self.mock_cache
        
        yield
        
        # Cleanup
        await self.cleanup()
        
    async def cleanup(self):
        """Clean up test resources."""
        await self.mock_cache.flushall()
        self.mock_db.reset_mock()
        self.mock_learning_service.reset_mock()

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_get_recommendations(self):
        """Tests individual recommendation generation with quality metrics."""
        # Setup test data
        test_preferences = {
            "theme": "dark",
            "language": "en",
            "notifications": True
        }
        test_context = {
            "time": datetime.utcnow().isoformat(),
            "location": "meeting",
            "activity": "group_chat"
        }
        
        # Mock learning service response
        self.mock_learning_service.get_preference_predictions.return_value = {
            "predictions": [
                {"type": "theme", "value": "dark", "confidence": 0.8},
                {"type": "language", "value": "en", "confidence": 0.9}
            ],
            "confidence_score": 0.85
        }
        
        # Test recommendation generation
        recommendations = await self.service.get_recommendations(
            user_id=TEST_USER_ID,
            recommendation_type="content",
            context=test_context
        )
        
        # Validate response structure
        assert isinstance(recommendations, list)
        assert len(recommendations) <= MAX_RECOMMENDATIONS
        
        # Validate recommendation quality
        for rec in recommendations:
            assert "item" in rec
            assert "score" in rec
            assert "confidence" in rec
            assert rec["score"] >= MIN_CONFIDENCE_SCORE
            assert isinstance(rec["timestamp"], str)
            
        # Verify cache interaction
        self.mock_cache.get.assert_called_once()
        self.mock_cache.setex.assert_called_once()
        
        # Verify learning service interaction
        self.mock_learning_service.get_preference_predictions.assert_called_once_with(
            user_id=TEST_USER_ID,
            preference_type="content",
            prediction_config={"context": test_context}
        )

    @pytest.mark.asyncio
    async def test_update_recommendation_models(self):
        """Tests model update functionality with comprehensive feedback scenarios."""
        # Setup test feedback data
        test_feedback = {
            "recommendation_id": str(uuid4()),
            "user_id": str(TEST_USER_ID),
            "rating": 4.5,
            "interaction_type": "click",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Test model update
        update_result = await self.service.update_recommendation_models(
            user_id=TEST_USER_ID,
            feedback_data=test_feedback
        )
        
        # Validate update result
        assert update_result["status"] == "success"
        assert "model_version" in update_result
        assert "update_timestamp" in update_result
        
        # Verify cache invalidation
        cache_key = f"rec_{TEST_USER_ID}:content"
        self.mock_cache.delete.assert_called_with(cache_key)
        
        # Test concurrent updates
        async def concurrent_update():
            return await self.service.update_recommendation_models(
                user_id=TEST_USER_ID,
                feedback_data=test_feedback
            )
            
        results = await asyncio.gather(
            *[concurrent_update() for _ in range(3)],
            return_exceptions=True
        )
        
        # Verify all updates succeeded
        assert all(r["status"] == "success" for r in results)

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_group_recommendations(self):
        """Tests group recommendation optimization with diverse group dynamics."""
        # Setup test group data
        test_group = {
            "group_id": TEST_GROUP_ID,
            "members": [str(uuid4()) for _ in range(5)],
            "context": {
                "purpose": "project_discussion",
                "activity_level": "high",
                "timezone": "UTC"
            }
        }
        
        # Mock group dynamics data
        mock_dynamics = {
            "active_users": test_group["members"],
            "interaction_patterns": {
                "daily_active_hours": [9, 10, 11, 14, 15, 16],
                "participation_ratio": 0.8
            },
            "preference_overlap": 0.6
        }
        
        # Test group recommendation generation
        recommendations = await self.service.get_group_recommendations(
            group_id=test_group["group_id"],
            context=test_group["context"]
        )
        
        # Validate group recommendations
        assert isinstance(recommendations, list)
        assert len(recommendations) <= MAX_RECOMMENDATIONS
        
        for rec in recommendations:
            # Verify recommendation structure
            assert "item" in rec
            assert "score" in rec
            assert "group_confidence" in rec
            assert "member_scores" in rec
            
            # Verify group optimization
            assert len(rec["member_scores"]) == len(test_group["members"])
            assert rec["group_confidence"] >= MIN_CONFIDENCE_SCORE
            
            # Verify fairness metrics
            member_scores = rec["member_scores"].values()
            score_variance = max(member_scores) - min(member_scores)
            assert score_variance <= 0.3  # Maximum allowed variance
            
        # Test edge cases
        # Empty group
        empty_result = await self.service.get_group_recommendations(
            group_id=UUID(int=0),
            context={}
        )
        assert len(empty_result) == 0
        
        # Single member group
        single_member = await self.service.get_group_recommendations(
            group_id=UUID(int=1),
            context={"members": [str(uuid4())]}
        )
        assert len(single_member) > 0

    @pytest.mark.asyncio
    async def test_recommendation_scoring(self):
        """Tests recommendation scoring algorithm accuracy and performance."""
        # Test data
        test_preferences = {
            "content": {"type": "technical", "level": "advanced"},
            "format": {"type": "article", "length": "long"},
            "topics": ["python", "testing", "automation"]
        }
        
        test_context = {
            "time": datetime.utcnow().isoformat(),
            "activity": "coding",
            "platform": "desktop"
        }
        
        test_item = {
            "content": {"type": "technical", "level": "advanced"},
            "format": {"type": "article", "length": "long"},
            "topics": ["python", "testing", "devops"]
        }
        
        # Calculate score
        score = await calculate_recommendation_score(
            user_preferences=test_preferences,
            context_data=test_context,
            recommendation_item=test_item,
            group_dynamics={"active_users": [str(TEST_USER_ID)]}
        )
        
        # Validate score
        assert isinstance(score, float)
        assert 0 <= score <= 1
        
        # Test weight influence
        preference_weight = SCORE_WEIGHTS["preference"]
        context_weight = SCORE_WEIGHTS["context"]
        diversity_weight = SCORE_WEIGHTS["diversity"]
        
        assert preference_weight + context_weight + diversity_weight == 1.0
        
        # Test edge cases
        # Empty preferences
        empty_score = await calculate_recommendation_score(
            user_preferences={},
            context_data=test_context,
            recommendation_item=test_item,
            group_dynamics={}
        )
        assert empty_score == 0.0
        
        # Perfect match
        perfect_score = await calculate_recommendation_score(
            user_preferences=test_item,
            context_data=test_context,
            recommendation_item=test_item,
            group_dynamics={"active_users": [str(TEST_USER_ID)]}
        )
        assert perfect_score > 0.9