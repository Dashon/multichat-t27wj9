"""
Preference Routes for AI-Enhanced Group Chat Platform
Implements high-performance FastAPI routes for preference management with caching,
monitoring, and comprehensive error handling.

Version: 1.0.0
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks  # v0.104+
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator  # v2.4+
from prometheus_client import Counter, Histogram, Gauge  # v0.17+
from redis import Redis  # v4.5+
from typing import Dict, List, Optional, Union, Any
from uuid import UUID
import json
from datetime import datetime, timedelta
from functools import wraps
from logging import getLogger

from ..services.learning_service import PreferenceLearningService
from ..services.recommendation_service import RecommendationService, calculate_recommendation_score
from ..models.preference import PreferenceModel
from ..models.user_profile import UserProfile

# Initialize router with prefix and tags
router = APIRouter(prefix='/api/v1/preferences', tags=['preferences'])

# Global constants
SUPPORTED_PREFERENCE_TYPES = ["ai_agent", "chat_group", "content", "ui", "recommendation"]
CACHE_TTL = 300  # 5 minutes cache TTL
MAX_BATCH_SIZE = 100
RATE_LIMIT_REQUESTS = 1000
RATE_LIMIT_WINDOW = 3600

# Initialize logging
logger = getLogger(__name__)

# Prometheus metrics
PREFERENCE_REQUESTS = Counter(
    'preference_requests_total',
    'Total number of preference requests',
    ['endpoint', 'status']
)
PREFERENCE_LATENCY = Histogram(
    'preference_latency_seconds',
    'Preference operation latency',
    ['endpoint']
)
CACHE_HIT_RATIO = Gauge(
    'preference_cache_hit_ratio',
    'Cache hit ratio for preferences'
)

# Request/Response Models
class PreferenceUpdateModel(BaseModel):
    """Model for preference update requests"""
    preference_type: str = Field(..., description="Type of preference to update")
    preference_data: Dict = Field(..., description="New preference data")
    confidence_score: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Confidence score for the update"
    )
    context: Optional[Dict] = Field(default=None, description="Optional context data")

    @validator('preference_type')
    def validate_preference_type(cls, v: str) -> str:
        if v not in SUPPORTED_PREFERENCE_TYPES:
            raise ValueError(f"Invalid preference type. Must be one of: {', '.join(SUPPORTED_PREFERENCE_TYPES)}")
        return v

class GroupContextModel(BaseModel):
    """Model for group recommendation context"""
    group_id: UUID = Field(..., description="Group identifier")
    context_type: str = Field(..., description="Type of group context")
    active_users: List[UUID] = Field(..., description="Currently active users")
    temporal_context: Optional[Dict] = Field(default=None, description="Temporal context data")

# Decorator for monitoring and error handling
def monitor_endpoint(endpoint_name: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = datetime.utcnow()
            try:
                result = await func(*args, **kwargs)
                PREFERENCE_REQUESTS.labels(
                    endpoint=endpoint_name,
                    status='success'
                ).inc()
                return result
            except Exception as e:
                PREFERENCE_REQUESTS.labels(
                    endpoint=endpoint_name,
                    status='error'
                ).inc()
                logger.error(f"Error in {endpoint_name}: {str(e)}")
                raise
            finally:
                latency = (datetime.utcnow() - start_time).total_seconds()
                PREFERENCE_LATENCY.labels(endpoint=endpoint_name).observe(latency)
        return wrapper
    return decorator

@router.get('/{user_id}/{preference_type}')
@monitor_endpoint('get_user_preferences')
async def get_user_preferences(
    user_id: UUID,
    preference_type: str,
    bypass_cache: bool = False,
    learning_service: PreferenceLearningService = Depends()
) -> Dict:
    """
    Retrieves user preferences with learning patterns and confidence scores.
    
    Args:
        user_id: User identifier
        preference_type: Type of preference to retrieve
        bypass_cache: Whether to bypass cache
        learning_service: Injected learning service
        
    Returns:
        Dict containing preferences and metrics
        
    Raises:
        HTTPException: If invalid parameters or service error
    """
    try:
        # Validate preference type
        if preference_type not in SUPPORTED_PREFERENCE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid preference type: {preference_type}"
            )

        # Check cache if not bypassed
        cache_key = f"pref_{user_id}:{preference_type}"
        if not bypass_cache:
            cached_data = await learning_service._cache.get(cache_key)
            if cached_data:
                CACHE_HIT_RATIO.inc()
                return json.loads(cached_data)

        # Get preferences and learning patterns
        user_profile = UserProfile(user_id=user_id)
        preferences = await PreferenceModel.get_history(
            user_id=user_id,
            preference_type=preference_type,
            limit=100
        )

        # Get predictions and confidence scores
        predictions = await learning_service.get_preference_predictions(
            user_id=user_id,
            preference_type=preference_type,
            prediction_config={}
        )

        response = {
            'user_id': str(user_id),
            'preference_type': preference_type,
            'preferences': preferences,
            'predictions': predictions,
            'confidence_score': predictions.get('confidence_score', 0.5),
            'timestamp': datetime.utcnow().isoformat()
        }

        # Cache response
        await learning_service._cache.setex(
            cache_key,
            CACHE_TTL,
            json.dumps(response)
        )

        return response

    except Exception as e:
        logger.error(f"Error retrieving preferences: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error retrieving preferences"
        )

@router.post('/{user_id}/update')
@monitor_endpoint('update_preferences')
async def update_preferences(
    user_id: UUID,
    preference_data: PreferenceUpdateModel,
    background_tasks: BackgroundTasks,
    learning_service: PreferenceLearningService = Depends()
) -> Dict:
    """
    Updates user preferences with learning model updates.
    
    Args:
        user_id: User identifier
        preference_data: Preference update data
        background_tasks: Background task manager
        learning_service: Injected learning service
        
    Returns:
        Dict containing update status and metrics
    """
    try:
        # Update preferences
        user_profile = UserProfile(user_id=user_id)
        update_result = await user_profile.update_preference(
            preference_type=preference_data.preference_type,
            preference_data=preference_data.preference_data,
            confidence_score=preference_data.confidence_score,
            context_data=preference_data.context
        )

        # Invalidate cache
        cache_key = f"pref_{user_id}:{preference_data.preference_type}"
        await learning_service._cache.delete(cache_key)

        # Schedule model update in background
        background_tasks.add_task(
            learning_service.update_learning_model,
            user_id=user_id,
            preference_type=preference_data.preference_type
        )

        return {
            'status': 'success',
            'user_id': str(user_id),
            'update_result': update_result,
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error updating preferences: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error updating preferences"
        )

@router.post('/batch-update')
@monitor_endpoint('batch_update_preferences')
async def batch_update_preferences(
    updates: List[PreferenceUpdateModel],
    atomic: bool = True,
    learning_service: PreferenceLearningService = Depends()
) -> Dict:
    """
    Performs batch preference updates with atomic transaction support.
    
    Args:
        updates: List of preference updates
        atomic: Whether to perform updates atomically
        learning_service: Injected learning service
        
    Returns:
        Dict containing batch update results
    """
    if len(updates) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds maximum of {MAX_BATCH_SIZE}"
        )

    try:
        results = []
        cache_keys = []

        # Process updates
        for update in updates:
            result = await learning_service.batch_update_preferences(
                preference_data=update.dict(),
                atomic=atomic
            )
            results.append(result)
            cache_keys.append(
                f"pref_{result['user_id']}:{update.preference_type}"
            )

        # Invalidate cache for all updated preferences
        if cache_keys:
            await learning_service._cache.delete(*cache_keys)

        return {
            'status': 'success',
            'updates_processed': len(results),
            'results': results,
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error in batch update: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error processing batch update"
        )

@router.post('/group/recommendations')
@monitor_endpoint('get_group_recommendations')
async def get_group_recommendations(
    user_ids: List[UUID],
    recommendation_type: str,
    group_context: GroupContextModel,
    use_cache: bool = True,
    recommendation_service: RecommendationService = Depends()
) -> List[Dict]:
    """
    Generates optimized group recommendations with fairness considerations.
    
    Args:
        user_ids: List of user identifiers
        recommendation_type: Type of recommendation
        group_context: Group context data
        use_cache: Whether to use cached recommendations
        recommendation_service: Injected recommendation service
        
    Returns:
        List of ranked group recommendations
    """
    try:
        if not user_ids:
            raise HTTPException(
                status_code=400,
                detail="No users provided for group recommendations"
            )

        # Get individual recommendations for each user
        user_recommendations = []
        for user_id in user_ids:
            recommendations = await recommendation_service.get_recommendations(
                user_id=user_id,
                recommendation_type=recommendation_type,
                context=group_context.dict(),
                refresh_cache=not use_cache
            )
            user_recommendations.append(recommendations)

        # Optimize recommendations for group
        group_optimized = await recommendation_service.optimize_group_preferences(
            user_recommendations=user_recommendations,
            group_context=group_context.dict()
        )

        return group_optimized

    except Exception as e:
        logger.error(f"Error generating group recommendations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error generating group recommendations"
        )