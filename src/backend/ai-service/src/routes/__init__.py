"""
Routes Package Initialization
Configures FastAPI router with comprehensive monitoring, error handling, and API versioning.

Version: 1.0.0
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Summary  # v0.17+

# Internal imports
from .agent_routes import router as agent_router

# Constants
API_VERSION = "v1"
ROUTE_PREFIX = f"/api/{API_VERSION}/ai"

# Initialize logging
logger = logging.getLogger(__name__)

# Prometheus metrics
ROUTE_METRICS = {
    "requests": Counter(
        "api_requests_total",
        "Total API requests",
        ["method", "endpoint", "status"]
    ),
    "latency": Summary(
        "api_request_latency_seconds",
        "Request latency in seconds",
        ["method", "endpoint"]
    )
}

async def error_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global error handler for API routes with monitoring.
    
    Args:
        request: FastAPI request object
        exc: Exception instance
        
    Returns:
        JSONResponse with error details
    """
    error_details = {
        "error": type(exc).__name__,
        "detail": str(exc),
        "path": request.url.path
    }
    
    if isinstance(exc, HTTPException):
        status_code = exc.status_code
    else:
        status_code = 500
        logger.error(f"Unhandled error: {str(exc)}", exc_info=True)
    
    # Update error metrics
    ROUTE_METRICS["requests"].labels(
        method=request.method,
        endpoint=request.url.path,
        status=status_code
    ).inc()
    
    return JSONResponse(
        status_code=status_code,
        content=error_details
    )

async def monitoring_middleware(request: Request, call_next: Any) -> Any:
    """
    Middleware for request monitoring and metrics collection.
    
    Args:
        request: FastAPI request object
        call_next: Next middleware in chain
        
    Returns:
        Response from next middleware
    """
    with ROUTE_METRICS["latency"].labels(
        method=request.method,
        endpoint=request.url.path
    ).time():
        response = await call_next(request)
        
        ROUTE_METRICS["requests"].labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        
        return response

def initialize_router() -> APIRouter:
    """
    Initialize and configure the main API router with monitoring and error handling.
    
    Returns:
        Configured APIRouter instance
    """
    # Create main router
    router = APIRouter(prefix=ROUTE_PREFIX)
    
    # Configure OpenAPI documentation
    router.tags = ["AI Service"]
    router.description = "AI agent management and interaction endpoints"
    
    # Add monitoring middleware
    router.middleware("http")(monitoring_middleware)
    
    # Configure error handlers
    router.exception_handler(Exception)(error_handler)
    router.exception_handler(HTTPException)(error_handler)
    
    # Include agent routes
    router.include_router(
        agent_router,
        prefix="/agents",
        tags=["AI Agents"]
    )
    
    logger.info(f"Initialized API router with prefix {ROUTE_PREFIX}")
    return router

# Initialize and export router instance
router = initialize_router()

__all__ = ["router"]