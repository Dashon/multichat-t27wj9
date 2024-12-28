"""
AI Orchestrator Service
----------------------
Core initialization module for the AI-Enhanced Group Chat Platform's AI service.
Provides centralized access to service configuration and version information.

This module serves as the main entry point for the AI Orchestrator service,
exposing key components for managing specialized AI agents in group conversations.

Version: 1.0.0
Author: AI-Enhanced Group Chat Platform Team
"""

from config.settings import Settings, get_settings  # v2.4+

# Version Information
__version__ = "1.0.0"
__author__ = "AI-Enhanced Group Chat Platform Team"
__description__ = "AI Orchestrator service for managing specialized AI agents in group conversations"

# Export key components
__all__ = [
    "Settings",
    "get_settings",
    "__version__",
    "__author__",
    "__description__",
]