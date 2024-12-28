"""
Agent Routes Module
Implements production-ready FastAPI route handlers for AI agent management and interaction.

Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from uuid import UUID

# External imports - v0.104+
from fastapi import APIRouter, HTTPException, Request, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from prometheus_client import Counter, Summary, Gauge  # v0.17+

# Internal imports
from ..models.agent import Agent, AGENT_TYPES, AgentStatus
from ..agents.base_agent import BaseAgent, AgentTimeoutError
from ..services.langchain_service import LangChainService
from ..config.settings import get_settings

# Initialize router with prefix and tags
router = APIRouter(prefix="/api/v1/agents", tags=["agents"])

# Constants
TIMEOUT_SECONDS = 5
MAX_RETRIES = 3

# Prometheus metrics
AGENT_REQUESTS = Counter(
    "agent_requests_total",
    "Total agent requests",
    ["endpoint", "status"]
)
AGENT_LATENCY = Summary(
    "agent_request_latency_seconds",
    "Request latency in seconds",
    ["endpoint"]
)
ACTIVE_AGENTS = Gauge(
    "active_agents_total",
    "Number of active agents"
)

# Initialize logger
logger = logging.getLogger(__name__)

class AgentCreate(BaseModel):
    """Enhanced request model for agent creation."""
    name: str = Field(..., min_length=3, max_length=50)
    specialties: List[str] = Field(..., min_items=1, max_items=3)
    capabilities: Dict[str, bool] = Field(default_factory=dict)
    config: Dict[str, Any] = Field(default_factory=dict)
    metadata: Optional[Dict[str, Any]] = None

    @validator("specialties")
    def validate_specialties(cls, v):
        """Validate agent specialties against supported types."""
        Agent.validate_specialties(v)
        return v

class MessageRequest(BaseModel):
    """Enhanced request model for message processing."""
    content: str = Field(..., min_length=1, max_length=4096)
    chat_id: str = Field(..., regex=r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    context: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

class MessageResponse(BaseModel):
    """Enhanced response model with metrics."""
    response: str
    agent_id: str
    processing_time: float
    context_used: bool
    quality_score: float
    metadata: Optional[Dict[str, Any]] = None

@router.post("/", response_model=Agent, status_code=201)
async def create_agent(
    agent_data: AgentCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    settings=Depends(get_settings)
) -> Agent:
    """
    Create a new AI agent with specified capabilities.

    Args:
        agent_data: Agent creation parameters
        request: FastAPI request object
        background_tasks: Background task manager
        settings: Application settings

    Returns:
        Created Agent instance

    Raises:
        HTTPException: If creation fails or validation errors occur
    """
    try:
        with AGENT_LATENCY.labels(endpoint="create_agent").time():
            # Validate agent data
            if not agent_data.name or not agent_data.specialties:
                raise ValueError("Name and specialties are required")

            # Create agent instance
            agent = Agent(
                name=agent_data.name,
                specialties=agent_data.specialties,
                capabilities=agent_data.capabilities,
                config=agent_data.config
            )

            # Initialize agent services
            langchain_service = LangChainService(
                settings.openai_api_key,
                settings.context_window_size
            )

            # Schedule background initialization
            background_tasks.add_task(
                initialize_agent_services,
                agent.id,
                langchain_service
            )

            AGENT_REQUESTS.labels(endpoint="create_agent", status="success").inc()
            ACTIVE_AGENTS.inc()

            logger.info(f"Created agent {agent.id} with specialties {agent.specialties}")
            return agent

    except ValueError as e:
        AGENT_REQUESTS.labels(endpoint="create_agent", status="error").inc()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        AGENT_REQUESTS.labels(endpoint="create_agent", status="error").inc()
        logger.error(f"Agent creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Agent creation failed")

@router.post("/{agent_id}/process", response_model=MessageResponse)
async def process_message(
    agent_id: str,
    message: MessageRequest,
    request: Request,
    settings=Depends(get_settings)
) -> MessageResponse:
    """
    Process a message using the specified agent.

    Args:
        agent_id: Agent identifier
        message: Message data
        request: FastAPI request object
        settings: Application settings

    Returns:
        Processed message response with metrics

    Raises:
        HTTPException: If processing fails or agent not found
    """
    try:
        with AGENT_LATENCY.labels(endpoint="process_message").time():
            start_time = datetime.utcnow()

            # Validate agent ID
            try:
                UUID(agent_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid agent ID format")

            # Get agent instance
            agent = await get_agent_instance(agent_id, settings)
            if not agent:
                raise HTTPException(status_code=404, detail="Agent not found")

            # Process message with timeout and retries
            try:
                response = await agent.process_message(
                    message.content,
                    message.chat_id,
                    message.context
                )
            except AgentTimeoutError:
                AGENT_REQUESTS.labels(endpoint="process_message", status="timeout").inc()
                raise HTTPException(status_code=408, detail="Processing timeout")

            # Calculate metrics
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            quality_score = await agent.validate_response(response, message.context or {})[1].get("quality_score", 0.0)

            AGENT_REQUESTS.labels(endpoint="process_message", status="success").inc()

            return MessageResponse(
                response=response,
                agent_id=agent_id,
                processing_time=processing_time,
                context_used=bool(message.context),
                quality_score=quality_score,
                metadata={
                    "specialties": agent.agent_data.specialties,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        AGENT_REQUESTS.labels(endpoint="process_message", status="error").inc()
        logger.error(f"Message processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Message processing failed")

@router.get("/{agent_id}/status")
async def get_agent_status(agent_id: str) -> Dict[str, Any]:
    """
    Get current status and metrics for an agent.

    Args:
        agent_id: Agent identifier

    Returns:
        Agent status information

    Raises:
        HTTPException: If agent not found
    """
    try:
        # Validate agent ID
        try:
            UUID(agent_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid agent ID format")

        # Get agent instance and status
        agent = await get_agent_instance(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        AGENT_REQUESTS.labels(endpoint="get_status", status="success").inc()

        return {
            "agent_id": agent_id,
            "status": "active" if agent.is_active else "inactive",
            "last_active": agent.agent_data.last_active.isoformat(),
            "performance_metrics": agent.agent_data.performance_metrics,
            "current_load": len(agent.context)
        }

    except HTTPException:
        raise
    except Exception as e:
        AGENT_REQUESTS.labels(endpoint="get_status", status="error").inc()
        logger.error(f"Failed to get agent status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get agent status")

async def get_agent_instance(agent_id: str, settings=None) -> Optional[BaseAgent]:
    """
    Helper function to get or create agent instance.

    Args:
        agent_id: Agent identifier
        settings: Optional settings instance

    Returns:
        BaseAgent instance or None if not found
    """
    # Implementation would retrieve agent from storage/cache
    # This is a placeholder for the actual implementation
    pass

async def initialize_agent_services(agent_id: str, langchain_service: LangChainService) -> None:
    """
    Initialize agent services in background.

    Args:
        agent_id: Agent identifier
        langchain_service: LangChain service instance
    """
    try:
        # Implementation would initialize required services
        # This is a placeholder for the actual implementation
        pass
    except Exception as e:
        logger.error(f"Failed to initialize agent services: {str(e)}")
        ACTIVE_AGENTS.dec()