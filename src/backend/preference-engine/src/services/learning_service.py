"""
Learning Service for AI-Enhanced Group Chat Platform
Implements advanced user preference learning and prediction with real-time caching
and enhanced confidence scoring capabilities.

Version: 1.0.0
"""

import numpy as np  # v1.24+
import pandas as pd  # v2.0+
from sklearn.metrics.pairwise import cosine_similarity  # v1.3+
from redis import Redis  # v4.5+
from typing import Dict, List, Optional, Union, Any
from uuid import UUID
import json
from datetime import datetime, timedelta
from functools import wraps
from logging import getLogger

from ..models.preference import PreferenceModel
from ..models.user_profile import UserProfile

# Global constants for learning service
LEARNING_RATE = 0.01
MIN_CONFIDENCE_THRESHOLD = 0.6
MIN_SAMPLES_REQUIRED = 5
PREDICTION_CACHE_TTL = 3600
MAX_RETRY_ATTEMPTS = 3
BATCH_SIZE = 100
MODEL_VERSION = '1.0.0'
CACHE_KEY_PREFIX = 'pref_pred_'

logger = getLogger(__name__)

def retry(max_attempts: int = MAX_RETRY_ATTEMPTS):
    """Decorator for handling retries with exponential backoff."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    wait_time = (2 ** attempt) * 0.1  # Exponential backoff
                    logger.warning(f"Attempt {attempt + 1} failed: {str(e)}, retrying in {wait_time}s")
                    await asyncio.sleep(wait_time)
            raise last_error
        return wrapper
    return decorator

@retry(max_attempts=MAX_RETRY_ATTEMPTS)
async def calculate_preference_similarity(
    pattern1: Dict,
    pattern2: Dict,
    weights: Dict
) -> float:
    """
    Calculates weighted similarity between preference patterns with confidence scoring.
    
    Args:
        pattern1: First preference pattern
        pattern2: Second preference pattern
        weights: Feature weights for similarity calculation
        
    Returns:
        float: Normalized similarity score between 0 and 1
    """
    # Validate inputs
    if not all([pattern1, pattern2, weights]):
        raise ValueError("Invalid input patterns or weights")
        
    # Convert patterns to numerical vectors
    features1 = np.array([pattern1.get(k, 0) for k in weights.keys()])
    features2 = np.array([pattern2.get(k, 0) for k in weights.keys()])
    weight_vector = np.array(list(weights.values()))
    
    # Apply feature scaling
    features1 = features1 / np.linalg.norm(features1)
    features2 = features2 / np.linalg.norm(features2)
    
    # Calculate weighted cosine similarity
    similarity = cosine_similarity(
        features1.reshape(1, -1),
        features2.reshape(1, -1)
    )[0][0]
    
    # Apply confidence weighting
    confidence_weight = min(
        pattern1.get('confidence', 0.5),
        pattern2.get('confidence', 0.5)
    )
    weighted_similarity = similarity * confidence_weight
    
    return max(0.0, min(1.0, weighted_similarity))

class PreferenceLearningService:
    """
    Advanced service for learning and predicting user preferences with real-time
    caching and confidence scoring capabilities.
    """
    
    def __init__(self, cache_config: Dict, model_config: Dict):
        """
        Initialize the preference learning service.
        
        Args:
            cache_config: Redis cache configuration
            model_config: Model training configuration
        """
        # Initialize Redis cache
        self._cache = Redis(
            host=cache_config['host'],
            port=cache_config['port'],
            db=cache_config.get('db', 0),
            decode_responses=True
        )
        
        # Initialize service components
        self._prediction_models = {}
        self._learning_patterns = {}
        self._confidence_threshold = model_config.get('confidence_threshold', MIN_CONFIDENCE_THRESHOLD)
        self._batch_size = model_config.get('batch_size', BATCH_SIZE)
        self._model_version = MODEL_VERSION
        
        logger.info(f"PreferenceLearningService initialized with model version {self._model_version}")

    async def learn_preferences(
        self,
        user_id: UUID,
        preference_type: str,
        learning_config: Dict
    ) -> Dict:
        """
        Learns user preferences from interaction history with batch processing.
        
        Args:
            user_id: User identifier
            preference_type: Type of preference to learn
            learning_config: Learning configuration parameters
            
        Returns:
            Dict containing learning results and metrics
        """
        # Validate inputs
        if not all([user_id, preference_type]):
            raise ValueError("Invalid user_id or preference_type")
            
        # Get user profile and history
        user_profile = UserProfile(user_id=user_id)
        history = await user_profile.get_preference_history(
            preference_type=preference_type,
            start_date=datetime.utcnow() - timedelta(days=30)
        )
        
        # Process in batches
        results = []
        for i in range(0, len(history['history']), self._batch_size):
            batch = history['history'][i:i + self._batch_size]
            
            # Analyze temporal patterns
            temporal_patterns = user_profile._analyze_temporal_patterns(batch)
            
            # Update learning patterns
            pattern_update = await user_profile.analyze_learning_patterns(
                preference_type,
                {'batch_data': batch}
            )
            
            results.append(pattern_update)
            
        # Calculate aggregate metrics
        confidence_scores = [r['stability_score'] for r in results]
        avg_confidence = sum(confidence_scores) / len(confidence_scores)
        
        # Update cache with new patterns
        cache_key = f"{CACHE_KEY_PREFIX}{user_id}:{preference_type}"
        cache_data = {
            'patterns': results,
            'confidence': avg_confidence,
            'timestamp': datetime.utcnow().isoformat(),
            'version': self._model_version
        }
        self._cache.setex(
            cache_key,
            PREDICTION_CACHE_TTL,
            json.dumps(cache_data)
        )
        
        return {
            'user_id': str(user_id),
            'preference_type': preference_type,
            'learning_results': results,
            'confidence_score': avg_confidence,
            'model_version': self._model_version,
            'timestamp': datetime.utcnow().isoformat()
        }

    async def get_preference_predictions(
        self,
        user_id: UUID,
        preference_type: str,
        prediction_config: Dict
    ) -> Dict:
        """
        Generates predictions for future user preferences with confidence scoring.
        
        Args:
            user_id: User identifier
            preference_type: Type of preference to predict
            prediction_config: Prediction configuration parameters
            
        Returns:
            Dict containing predictions and confidence scores
        """
        # Check cache first
        cache_key = f"{CACHE_KEY_PREFIX}{user_id}:{preference_type}"
        cached_data = self._cache.get(cache_key)
        
        if cached_data:
            cached_predictions = json.loads(cached_data)
            if cached_predictions['version'] == self._model_version:
                return cached_predictions
        
        # Get user profile and learning patterns
        user_profile = UserProfile(user_id=user_id)
        learning_patterns = user_profile.learning_patterns.get(preference_type, {})
        
        if not learning_patterns:
            return {
                'user_id': str(user_id),
                'preference_type': preference_type,
                'predictions': [],
                'confidence_score': 0.0,
                'model_version': self._model_version,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        # Generate predictions
        predictions = []
        for pattern in learning_patterns.get('temporal_patterns', {}).items():
            if pattern[1] >= MIN_SAMPLES_REQUIRED:
                prediction = {
                    'pattern_type': pattern[0],
                    'confidence': min(
                        pattern[1] / MIN_SAMPLES_REQUIRED,
                        learning_patterns.get('preference_stability', 0.5)
                    ),
                    'predicted_value': pattern[1]
                }
                predictions.append(prediction)
                
        # Calculate overall confidence
        avg_confidence = sum(p['confidence'] for p in predictions) / len(predictions) if predictions else 0.0
        
        # Prepare response
        response = {
            'user_id': str(user_id),
            'preference_type': preference_type,
            'predictions': predictions,
            'confidence_score': avg_confidence,
            'model_version': self._model_version,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Cache predictions
        self._cache.setex(
            cache_key,
            PREDICTION_CACHE_TTL,
            json.dumps(response)
        )
        
        return response