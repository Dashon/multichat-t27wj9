"""
Preference Engine Service - Core Package Initialization
Handles user preference learning, pattern recognition, and personalization.

This package provides core configuration settings, version information,
and initializes essential components for the recommendation system.

Version: 1.0.0
"""

import importlib.metadata  # v3.11+
import logging
from typing import Optional  # v3.11+

from config.settings import Settings  # Internal import for configuration management

# Package metadata
__version__ = importlib.metadata.version('preference-engine')
__author__ = 'AI-Enhanced Group Chat Platform Team'
__description__ = 'Preference learning and recommendation engine for the AI-Enhanced Group Chat Platform'

# Initialize logging
logger = logging.getLogger(__name__)

class ConfigurationError(Exception):
    """Custom exception for configuration validation errors."""
    
    def __init__(self, message: str) -> None:
        """Initialize configuration error with custom message.
        
        Args:
            message: Detailed error description
        """
        super().__init__(message)
        self.message = message

def initialize_logging() -> None:
    """Configure logging for the preference engine service.
    
    Sets up console handler with appropriate format and log level
    based on the environment configuration.
    """
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    # Get log level from settings or default to INFO
    log_level = Settings().MONITORING_CONFIG.get('log_level', 'INFO')
    logger.setLevel(getattr(logging, log_level))
    
    logger.addHandler(console_handler)
    logger.info(f"Preference Engine v{__version__} logging initialized")

def validate_configuration(settings: Settings) -> bool:
    """Validate all required configuration settings.
    
    Args:
        settings: Settings instance containing configuration parameters
        
    Returns:
        bool: True if configuration is valid
        
    Raises:
        ConfigurationError: If configuration validation fails
    """
    try:
        # Validate MongoDB URI format and connection parameters
        if not settings.MONGODB_URI:
            raise ConfigurationError("MongoDB URI is required")
            
        # Validate Redis URI format and connection parameters
        if not settings.REDIS_URI:
            raise ConfigurationError("Redis URI is required")
            
        # Validate learning parameters
        if not 0 < settings.LEARNING_RATE <= 1.0:
            raise ConfigurationError("Learning rate must be between 0 and 1")
            
        if not 0 < settings.MODEL_UPDATE_INTERVAL <= 86400:
            raise ConfigurationError("Model update interval must be between 1 minute and 24 hours")
            
        # Validate preference types
        if not settings.SUPPORTED_PREFERENCE_TYPES:
            raise ConfigurationError("At least one preference type must be supported")
            
        # Validate monitoring configuration
        if not settings.MONITORING_CONFIG.get('enabled'):
            logger.warning("Monitoring is disabled - this is not recommended for production")
            
        logger.info("Configuration validation successful")
        return True
        
    except Exception as e:
        logger.error(f"Configuration validation failed: {str(e)}")
        raise ConfigurationError(f"Configuration validation failed: {str(e)}")

# Initialize logging when package is imported
initialize_logging()

# Export public interface
__all__ = [
    '__version__',
    '__author__',
    '__description__',
    'Settings',
    'ConfigurationError',
    'validate_configuration',
    'initialize_logging'
]