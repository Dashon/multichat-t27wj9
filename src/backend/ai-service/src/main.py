"""
Main Entry Point for AI Orchestrator Service
Initializes FastAPI application with comprehensive middleware, monitoring, and service configuration.

Version: 1.0.0
"""

import logging
import sys
from typing import Dict, Any

# External imports with versions
from fastapi import FastAPI, Request  # v0.104+
from fastapi.middleware.cors import CORSMiddleware  # v0.104+
from fastapi.middleware.gzip import GZipMiddleware  # v0.104+
from prometheus_client import make_asgi_app  # v0.17+
import uvicorn  # v0.24+
from starlette.middleware.base import BaseHTTPMiddleware  # v0.27+
from starlette.middleware.sessions import SessionMiddleware  # v0.27+

# Internal imports
from config.settings import get_settings
from routes.agent_routes import router
from context.context_manager import ContextManager
from context.vector_store import VectorStore
from services.openai_service import OpenAIService
from services.langchain_service import LangChainService

# Initialize settings and logging
settings = get_settings()
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('ai_service.log')
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app with metadata
app = FastAPI(
    title="AI Orchestrator Service",
    description="Enterprise-grade AI agent management service",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Global context manager instance
context_manager = None

class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware to add request ID for tracing."""
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers['X-Request-ID'] = request_id
        return response

async def init_app() -> FastAPI:
    """
    Initialize FastAPI application with comprehensive middleware and routes.
    
    Returns:
        FastAPI: Configured application instance
    """
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"]
    )

    # Add compression middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Add request ID middleware
    app.add_middleware(RequestIDMiddleware)

    # Add session middleware
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        max_age=3600
    )

    # Mount Prometheus metrics endpoint
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)

    # Add health check endpoints
    @app.get("/health/live", tags=["health"])
    async def liveness_check():
        return {"status": "alive"}

    @app.get("/health/ready", tags=["health"])
    async def readiness_check():
        return {
            "status": "ready",
            "services": {
                "vector_store": context_manager is not None,
                "openai": True  # Add actual health check
            }
        }

    # Include agent routes
    app.include_router(router)

    return app

@app.on_event("startup")
async def startup_event():
    """
    Handle application startup tasks including service initialization.
    """
    try:
        global context_manager

        logger.info("Starting AI Orchestrator Service...")

        # Initialize vector store
        vector_store = VectorStore(
            pool_size=10,
            timeout=settings.request_timeout
        )

        # Initialize OpenAI service
        openai_service = OpenAIService(settings)

        # Initialize LangChain service
        langchain_service = LangChainService(
            openai_service,
            settings.context_window_size
        )

        # Initialize context manager
        context_manager = ContextManager(
            vector_store=vector_store,
            openai_service=openai_service,
            config={
                "max_context_age": settings.max_context_age,
                "batch_size": settings.batch_size
            }
        )

        logger.info("AI Orchestrator Service started successfully")

    except Exception as e:
        logger.error(f"Failed to start AI Orchestrator Service: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """
    Handle graceful shutdown of application services.
    """
    try:
        logger.info("Shutting down AI Orchestrator Service...")

        if context_manager:
            await context_manager.close()

        logger.info("AI Orchestrator Service shutdown complete")

    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")
        raise

def main():
    """
    Entry point for running the application with uvicorn server.
    """
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development",
        workers=4,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_keep_alive=30,
        ssl_keyfile=settings.ssl_keyfile if settings.environment == "production" else None,
        ssl_certfile=settings.ssl_certfile if settings.environment == "production" else None
    )

if __name__ == "__main__":
    main()