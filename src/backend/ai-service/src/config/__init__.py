"""
Configuration initialization module for the AI service.

This module serves as the entry point for configuration access throughout the AI service,
providing thread-safe access to validated configuration settings and environment variables.
Re-exports essential configuration components while encapsulating implementation details.

Exports:
    - Settings: Configuration class for managing service settings
    - get_settings: Thread-safe factory function for retrieving settings instance

Version: 1.0.0
"""

# v2.4+ for Settings class
# v1.0+ for get_settings factory function
from .settings import Settings, get_settings

# Re-export essential components
__all__ = ["Settings", "get_settings"]