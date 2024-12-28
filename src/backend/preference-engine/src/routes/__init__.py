"""
Route Aggregator Module for AI-Enhanced Group Chat Platform
Consolidates and exports preference-related API routes for centralized management.

Version: 1.0.0
Dependencies:
- fastapi v0.104+
"""

from .preference_routes import router

# Export the router for service-level access
__all__ = ["router"]