"""
AI Service Utilities Package
---------------------------
Core utility functions and classes for logging, request tracing, and common functionality.
Provides structured logging integration with ELK Stack and supports comprehensive system observability.

Version: 1.0.0
"""

from .logger import setup_logging, get_logger, CustomJSONFormatter  # v1.0.0

# Global version for the utils package
__version__ = '1.0.0'

# Define public exports
__all__ = [
    'setup_logging',
    'get_logger',
    'CustomJSONFormatter',
]

# Initialize default logger for the utils package
_utils_logger = get_logger('utils')

def get_request_id() -> str:
    """
    Generates or retrieves the current request ID for distributed tracing.
    Used for correlating logs and events across service boundaries.
    
    Returns:
        str: Unique request identifier in UUID format
    """
    import uuid
    from contextvars import ContextVar
    
    # Context variable to store request ID throughout the request lifecycle
    REQUEST_ID_CTX_VAR: ContextVar[str] = ContextVar('request_id', default='')
    
    try:
        # Try to get existing request ID from context
        request_id = REQUEST_ID_CTX_VAR.get()
        if not request_id:
            # Generate new request ID if none exists
            request_id = str(uuid.uuid4())
            REQUEST_ID_CTX_VAR.set(request_id)
        return request_id
    except Exception as e:
        _utils_logger.warning(f"Error getting request ID: {str(e)}")
        # Fallback to new UUID if context retrieval fails
        return str(uuid.uuid4())

# Initialize logging with default configuration
try:
    setup_logging()
    _utils_logger.debug("Utils package initialized successfully")
except Exception as e:
    # Fallback to basic logging if setup fails
    import logging
    logging.basicConfig(level=logging.INFO)
    logging.warning(f"Failed to initialize utils package logging: {str(e)}")