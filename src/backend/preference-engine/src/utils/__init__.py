"""
Preference Engine Utils Package
Provides centralized access to logging utilities and performance monitoring capabilities.

This package initializes and exports logging functionality with ELK Stack integration
and comprehensive performance metric collection support.

Version: 1.0.0
"""

from .logger import (
    setup_logging,
    get_logger,
    PreferenceEngineJSONFormatter
)

# Export public interface
__all__ = [
    'setup_logging',
    'get_logger',
    'PreferenceEngineJSONFormatter'
]

# Initialize default logger configuration
# This ensures basic logging is available even before explicit setup
default_logger = get_logger('preference_engine.utils')
default_logger.debug('Preference Engine utils package initialized')

# Version information
__version__ = '1.0.0'
__author__ = 'AI-Enhanced Group Chat Platform Team'
__license__ = 'Proprietary'

# Package metadata
PACKAGE_METADATA = {
    'name': 'preference-engine-utils',
    'version': __version__,
    'description': 'Utility package for Preference Engine service',
    'supports_elk': True,
    'supports_performance_monitoring': True
}