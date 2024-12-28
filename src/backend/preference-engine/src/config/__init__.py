"""
Initialization module for the Preference Engine configuration.
Provides a centralized, thread-safe configuration management system with
comprehensive validation and secure settings handling.

Version: 1.0.0
"""

import os
import logging
import threading
from typing import Optional

from .settings import Settings

# Initialize module-level logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Thread safety for singleton pattern
_instance_lock = threading.Lock()
_settings_instance: Optional[Settings] = None

# Version information for deployment tracking
__version__ = '1.0.0'

def get_settings() -> Settings:
    """
    Thread-safe singleton accessor for settings instance.
    Ensures only one validated settings instance exists across threads.
    
    Returns:
        Settings: Validated settings instance with all required configuration
        
    Raises:
        ConfigurationError: If settings validation fails
    """
    global _settings_instance
    
    if _settings_instance is None:
        with _instance_lock:
            # Double-checked locking pattern
            if _settings_instance is None:
                logger.info("Initializing preference engine settings...")
                try:
                    _settings_instance = Settings()
                    validate_settings(_settings_instance)
                    logger.info("Settings initialized successfully")
                except Exception as e:
                    logger.error(f"Failed to initialize settings: {str(e)}")
                    raise ConfigurationError(f"Settings initialization failed: {str(e)}")
    
    return _settings_instance

def validate_settings(settings: Settings) -> bool:
    """
    Validates all required settings and their values.
    Ensures all critical configuration parameters are present and valid.
    
    Args:
        settings: Settings instance to validate
        
    Returns:
        bool: True if all settings are valid
        
    Raises:
        ConfigurationError: If any required settings are invalid
    """
    try:
        # Validate database URIs
        if not settings.MONGODB_URI or not settings.REDIS_URI:
            raise ConfigurationError("Database URIs must be configured")
            
        # Validate learning parameters
        if not (0 < settings.LEARNING_RATE <= 1.0):
            raise ConfigurationError("Learning rate must be between 0 and 1")
            
        if not (60 <= settings.MODEL_UPDATE_INTERVAL <= 86400):
            raise ConfigurationError("Model update interval must be between 60s and 24h")
            
        if not (0 < settings.PREFERENCE_HISTORY_LIMIT <= 1000):
            raise ConfigurationError("Preference history limit must be between 1 and 1000")
            
        if not (60 <= settings.CACHE_EXPIRY <= 86400):
            raise ConfigurationError("Cache expiry must be between 60s and 24h")
            
        # Validate database configuration
        db_config = settings.get_database_config()
        if not all(key in db_config for key in ['uri', 'options', 'connection_pool']):
            raise ConfigurationError("Incomplete database configuration")
            
        # Validate cache configuration
        cache_config = settings.get_cache_config()
        if not all(key in cache_config for key in ['url', 'expiry', 'connection_pool']):
            raise ConfigurationError("Incomplete cache configuration")
            
        logger.info("Settings validation completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Settings validation failed: {str(e)}")
        raise ConfigurationError(f"Settings validation error: {str(e)}")

class ConfigurationError(Exception):
    """Custom exception for configuration-related errors"""
    pass

# Initialize and validate settings on module import
settings = get_settings()

# Export version information
__all__ = ['settings', '__version__']