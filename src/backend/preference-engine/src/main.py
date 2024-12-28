"""
Main entry point for the Preference Engine service.
Initializes FastAPI application with comprehensive monitoring, health checks,
and core preference learning services.

Version: 1.0.0
"""

import asyncio
import sentry_sdk  # v1.32+
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator  # v6.1+
import structlog  # v23.1+
from circuitbreaker import circuit  # v1.4+
import uvicorn  # v0.24+
from typing import Dict, Any
import os

from config.settings import Settings
from services.learning_service import PreferenceLearningService

# Initialize structured logging
logger = structlog.get_logger()

# Initialize FastAPI application
app = FastAPI(
    title='Preference Engine Service',
    version='1.0.0',
    docs_url='/api/docs',
    redoc_url='/api/redoc'
)

# Initialize settings and core services
settings = Settings()
learning_service: PreferenceLearningService = None

async def init_monitoring() -> None:
    """
    Initializes comprehensive monitoring and observability tools.
    Sets up Sentry, Prometheus metrics, and structured logging.
    """
    # Initialize Sentry SDK for error tracking
    sentry_sdk.init(
        dsn=os.getenv('SENTRY_DSN'),
        environment=os.getenv('ENVIRONMENT', 'production'),
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
    )
    
    # Setup Prometheus metrics
    Instrumentator().instrument(app).expose(app, include_in_schema=False)
    
    # Configure custom metrics for preference engine
    Instrumentator().add(
        metrics={
            'preference_learning_duration_seconds': {
                'type': 'Histogram',
                'description': 'Duration of preference learning operations',
                'buckets': (0.1, 0.5, 1.0, 2.0, 5.0)
            },
            'preference_confidence_score': {
                'type': 'Gauge',
                'description': 'Current confidence score for preferences'
            }
        }
    )
    
    logger.info("Monitoring services initialized successfully")

@app.on_event("startup")
async def startup_event() -> None:
    """
    Handles application startup with comprehensive validation.
    Initializes core services, database connections, and monitoring.
    """
    try:
        # Validate configuration
        settings.validate_uris()
        cache_config = settings.get_cache_config()
        
        # Initialize learning service
        global learning_service
        learning_service = PreferenceLearningService(
            cache_config=cache_config,
            model_config={
                'confidence_threshold': 0.6,
                'batch_size': 100
            }
        )
        await learning_service.initialize_models()
        
        # Initialize monitoring
        await init_monitoring()
        
        # Setup CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # Configure appropriately for production
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        logger.info("Preference Engine service started successfully")
        
    except Exception as e:
        logger.error("Failed to start service", error=str(e))
        raise

@app.on_event("shutdown")
async def shutdown_event() -> None:
    """
    Handles graceful service shutdown.
    Ensures proper cleanup of resources and connections.
    """
    try:
        if learning_service:
            await learning_service.cleanup_resources()
            
        # Flush monitoring metrics
        await asyncio.sleep(1)  # Allow time for final metric updates
        
        logger.info("Service shutdown completed successfully")
        
    except Exception as e:
        logger.error("Error during shutdown", error=str(e))
        raise

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Global exception handler for HTTP exceptions.
    Ensures consistent error response format.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "path": str(request.url)
        }
    )

@app.get("/health")
@circuit(failure_threshold=5, recovery_timeout=60)
async def health_check() -> Dict[str, Any]:
    """
    Comprehensive health check endpoint with dependency validation.
    """
    try:
        # Check learning service health
        model_status = await learning_service.get_model_status()
        cache_status = await learning_service.check_cache_connection()
        
        return {
            "status": "healthy",
            "timestamp": str(datetime.utcnow()),
            "version": app.version,
            "dependencies": {
                "learning_service": model_status,
                "cache": cache_status
            }
        }
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service unhealthy"
        )

def main() -> None:
    """
    Application entry point with enhanced error handling.
    Configures and starts the Uvicorn server.
    """
    try:
        # Configure Uvicorn with production settings
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=int(os.getenv("PORT", 8000)),
            workers=int(os.getenv("WORKERS", 4)),
            log_level="info",
            proxy_headers=True,
            forwarded_allow_ips="*",
            loop="uvloop",
            http="httptools",
            lifespan="on"
        )
    except Exception as e:
        logger.error("Failed to start server", error=str(e))
        raise

if __name__ == "__main__":
    main()