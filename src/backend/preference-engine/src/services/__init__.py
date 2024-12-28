"""
Initialization module for the AI-Enhanced Group Chat Platform's preference engine services.
Exposes core learning and recommendation service classes for user preference management
and personalized recommendations.

This module provides:
- PreferenceLearningService: For user preference analysis and pattern recognition
- RecommendationService: For generating personalized and group-based recommendations

Version: 1.0.0
"""

from .learning_service import PreferenceLearningService
from .recommendation_service import RecommendationService

# Define public API
__all__ = [
    "PreferenceLearningService",
    "RecommendationService"
]

# Package version
__version__ = "1.0.0"