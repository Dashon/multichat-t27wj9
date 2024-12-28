"""
Models Package Initialization
Exposes core model classes and constants for the AI service with comprehensive type safety
and documentation.

Version: 1.0.0
"""

# Import core model classes and constants
from .agent import Agent, AGENT_TYPES
from .context import (
    Context,
    MAX_SHORT_TERM_MESSAGES,
    MAX_CONTEXT_AGE_HOURS
)
from .message import Message, MAX_CONTENT_LENGTH

# Export core classes and constants with type hints
__all__ = [
    # Agent management
    "Agent",           # Agent model class for specialized AI agents
    "AGENT_TYPES",     # List of valid agent specialization types
    
    # Context management
    "Context",         # Context model for conversation state
    "MAX_SHORT_TERM_MESSAGES",  # Maximum messages in short-term memory
    "MAX_CONTEXT_AGE_HOURS",    # Maximum age for context retention
    
    # Message processing
    "Message",         # Enhanced message model with AI capabilities
    "MAX_CONTENT_LENGTH"  # Maximum allowed message content length
]

# Version information
__version__ = "1.0.0"