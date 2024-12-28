"""
Preference Engine Models Package
Exposes core data models for preference tracking and user profile management.

This module serves as the central point for accessing preference learning framework
components, ensuring type-safe imports and exports while maintaining clean architecture
principles. It consolidates essential models required for user preference tracking,
pattern recognition, and personalization features.

Version: 1.0.0
"""

# Import core models with type safety
from .preference import PreferenceModel
from .user_profile import UserProfile

# Define public exports
__all__ = [
    "PreferenceModel",  # Core preference data model
    "UserProfile",      # User profile and pattern management model
]

# Version information
__version__ = "1.0.0"

# Module metadata
__author__ = "AI-Enhanced Group Chat Platform Team"
__copyright__ = "Copyright 2023"
__status__ = "Production"

# Type hints for better IDE support and static analysis
PreferenceModelType = PreferenceModel
UserProfileType = UserProfile