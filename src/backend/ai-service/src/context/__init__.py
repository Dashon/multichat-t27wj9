"""Context management package for AI-Enhanced Group Chat Platform.

Provides comprehensive context management capabilities including:
- Short-term conversation memory
- Long-term knowledge persistence
- Group context awareness
- Vector embedding operations

Classes:
    ContextManager: Orchestrates conversation context management
    VectorStore: Handles vector embedding operations

Version: 1.0.0
"""

# Version information
__version__ = "1.0.0"

# Import core components
from .context_manager import ContextManager  # v1.0.0
from .vector_store import VectorStore  # v1.0.0

# Define public API
__all__ = [
    "ContextManager",
    "VectorStore",
    "__version__"
]