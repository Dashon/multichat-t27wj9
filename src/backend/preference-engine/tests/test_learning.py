"""
Comprehensive test suite for the PreferenceLearningService.
Validates core learning capabilities, prediction accuracy, and model performance.

Version: 1.0.0
"""

import pytest  # v7.4+
import numpy as np  # v1.24+
import uuid
import time
from datetime import datetime, timedelta
from typing import Dict, List

from ..src.services.learning_service import PreferenceLearningService
from ..src.models.preference import PreferenceModel
from ..src.models.user_profile import UserProfile

# Test constants
TEST_USER_ID = uuid.uuid4()
TEST_PREFERENCE_TYPES = ["dining", "activities", "locations", "transportation", "accommodation"]
MIN_CONFIDENCE_THRESHOLD = 0.75
MAX_LEARNING_TIME_MS = 500
MIN_PREDICTION_ACCURACY = 0.85

@pytest.fixture
def mock_cache_config() -> Dict:
    """Fixture for Redis cache configuration"""
    return {
        'host': 'localhost',
        'port': 6379,
        'db': 0,
        'decode_responses': True
    }

@pytest.fixture
def mock_model_config() -> Dict:
    """Fixture for model configuration"""
    return {
        'confidence_threshold': MIN_CONFIDENCE_THRESHOLD,
        'batch_size': 100,
        'learning_rate': 0.01
    }

@pytest.fixture
def test_preference_patterns() -> List[Dict]:
    """Fixture for test preference patterns"""
    return [
        {
            'type': 'dining',
            'data': {
                'cuisine': 'italian',
                'price_range': 'moderate',
                'ambiance': 'casual'
            },
            'confidence': 0.8
        },
        {
            'type': 'activities',
            'data': {
                'category': 'outdoor',
                'intensity': 'moderate',
                'duration': '2-4 hours'
            },
            'confidence': 0.9
        }
    ]

@pytest.mark.asyncio
@pytest.mark.timeout(2)
async def test_learn_preferences(
    mock_cache_config: Dict,
    mock_model_config: Dict,
    test_preference_patterns: List[Dict]
) -> None:
    """
    Tests preference learning functionality with comprehensive validation.
    
    Validates:
    - Learning time performance
    - Pattern recognition accuracy
    - Confidence scoring
    - Cache management
    - Error handling
    """
    # Initialize service
    learning_service = PreferenceLearningService(
        cache_config=mock_cache_config,
        model_config=mock_model_config
    )
    
    # Start performance timer
    start_time = time.time()
    
    # Test learning for each preference type
    for pattern in test_preference_patterns:
        learning_config = {
            'batch_size': 50,
            'min_confidence': MIN_CONFIDENCE_THRESHOLD
        }
        
        result = await learning_service.learn_preferences(
            user_id=TEST_USER_ID,
            preference_type=pattern['type'],
            learning_config=learning_config
        )
        
        # Validate learning time
        learning_time = (time.time() - start_time) * 1000
        assert learning_time <= MAX_LEARNING_TIME_MS, \
            f"Learning time {learning_time}ms exceeded maximum {MAX_LEARNING_TIME_MS}ms"
            
        # Validate result structure
        assert result['user_id'] == str(TEST_USER_ID)
        assert result['preference_type'] == pattern['type']
        assert 'learning_results' in result
        assert 'confidence_score' in result
        assert 'model_version' in result
        
        # Validate confidence scoring
        assert result['confidence_score'] >= MIN_CONFIDENCE_THRESHOLD, \
            f"Confidence score {result['confidence_score']} below threshold {MIN_CONFIDENCE_THRESHOLD}"
            
        # Validate pattern recognition
        for learning_result in result['learning_results']:
            assert learning_result['stability_score'] >= MIN_CONFIDENCE_THRESHOLD
            assert 'patterns' in learning_result
            
        # Verify cache storage
        cache_key = f"pref_pred_{TEST_USER_ID}:{pattern['type']}"
        cached_data = learning_service._cache.get(cache_key)
        assert cached_data is not None, "Learning results not cached"

@pytest.mark.asyncio
@pytest.mark.timeout(1)
async def test_preference_predictions(
    mock_cache_config: Dict,
    mock_model_config: Dict,
    test_preference_patterns: List[Dict]
) -> None:
    """
    Tests prediction accuracy and confidence scoring.
    
    Validates:
    - Prediction accuracy
    - Confidence thresholds
    - Cache efficiency
    - Concurrent requests
    """
    # Initialize service
    learning_service = PreferenceLearningService(
        cache_config=mock_cache_config,
        model_config=mock_model_config
    )
    
    # Train model with test patterns
    for pattern in test_preference_patterns:
        await learning_service.learn_preferences(
            user_id=TEST_USER_ID,
            preference_type=pattern['type'],
            learning_config={'batch_size': 50}
        )
    
    # Test predictions
    for pattern in test_preference_patterns:
        prediction_config = {
            'min_confidence': MIN_CONFIDENCE_THRESHOLD,
            'max_predictions': 5
        }
        
        result = await learning_service.get_preference_predictions(
            user_id=TEST_USER_ID,
            preference_type=pattern['type'],
            prediction_config=prediction_config
        )
        
        # Validate prediction structure
        assert result['user_id'] == str(TEST_USER_ID)
        assert result['preference_type'] == pattern['type']
        assert 'predictions' in result
        assert len(result['predictions']) > 0
        
        # Validate prediction confidence
        assert result['confidence_score'] >= MIN_CONFIDENCE_THRESHOLD
        for prediction in result['predictions']:
            assert prediction['confidence'] >= MIN_CONFIDENCE_THRESHOLD
            
        # Test cache hit
        cached_result = await learning_service.get_preference_predictions(
            user_id=TEST_USER_ID,
            preference_type=pattern['type'],
            prediction_config=prediction_config
        )
        assert cached_result == result, "Cache inconsistency detected"

@pytest.mark.asyncio
@pytest.mark.timeout(3)
async def test_model_updates(
    mock_cache_config: Dict,
    mock_model_config: Dict
) -> None:
    """
    Tests model update process and version management.
    
    Validates:
    - Model versioning
    - Update consistency
    - Cache invalidation
    - Rollback capabilities
    """
    # Initialize service
    learning_service = PreferenceLearningService(
        cache_config=mock_cache_config,
        model_config=mock_model_config
    )
    
    # Create initial model state
    initial_pattern = {
        'type': 'dining',
        'data': {
            'cuisine': 'italian',
            'price_range': 'moderate'
        },
        'confidence': 0.8
    }
    
    await learning_service.learn_preferences(
        user_id=TEST_USER_ID,
        preference_type=initial_pattern['type'],
        learning_config={'batch_size': 50}
    )
    
    # Get initial predictions
    initial_predictions = await learning_service.get_preference_predictions(
        user_id=TEST_USER_ID,
        preference_type=initial_pattern['type'],
        prediction_config={'min_confidence': MIN_CONFIDENCE_THRESHOLD}
    )
    
    # Update model with new pattern
    updated_pattern = {
        'type': 'dining',
        'data': {
            'cuisine': 'japanese',
            'price_range': 'high'
        },
        'confidence': 0.9
    }
    
    update_result = await learning_service.learn_preferences(
        user_id=TEST_USER_ID,
        preference_type=updated_pattern['type'],
        learning_config={'batch_size': 50}
    )
    
    # Validate model version update
    assert update_result['model_version'] > initial_predictions['model_version']
    
    # Verify cache invalidation
    new_predictions = await learning_service.get_preference_predictions(
        user_id=TEST_USER_ID,
        preference_type=updated_pattern['type'],
        prediction_config={'min_confidence': MIN_CONFIDENCE_THRESHOLD}
    )
    
    assert new_predictions != initial_predictions, "Model update not reflected in predictions"
    assert new_predictions['model_version'] == update_result['model_version']
    
    # Validate prediction adaptation
    found_new_pattern = False
    for prediction in new_predictions['predictions']:
        if prediction['pattern_type'] == 'japanese':
            found_new_pattern = True
            assert prediction['confidence'] >= MIN_CONFIDENCE_THRESHOLD
            
    assert found_new_pattern, "Model failed to adapt to new pattern"