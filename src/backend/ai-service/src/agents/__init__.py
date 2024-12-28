"""
AI Agents Module
Initializes and exports specialized AI agents with factory pattern implementation
and enhanced monitoring capabilities.

Version: 1.0.0
"""

import logging  # v3.11+
from typing import Dict, Any, Optional  # v3.11+
from prometheus_client import Counter, Gauge  # v0.17+

# Internal imports
from .base_agent import BaseAgent
from .explorer_agent import ExplorerAgent
from .foodie_agent import FoodieAgent
from .planner_agent import PlannerAgent

# Initialize logging
logger = logging.getLogger(__name__)

# Initialize metrics
AGENT_METRICS = {
    'agent_instances': Gauge(
        'ai_agent_instances_total',
        'Number of active agent instances',
        ['agent_type']
    ),
    'agent_creations': Counter(
        'ai_agent_creations_total',
        'Total number of agent instances created',
        ['agent_type']
    )
}

# Define available agent types and their implementations
AVAILABLE_AGENTS: Dict[str, type] = {
    'explorer': ExplorerAgent,
    'foodie': FoodieAgent,
    'planner': PlannerAgent
}

# List of supported agent types for validation
AGENT_TYPES = list(AVAILABLE_AGENTS.keys())

def get_agent_instance(
    agent_type: str,
    config: Dict[str, Any]
) -> BaseAgent:
    """
    Factory function to create and return an instance of the requested agent type
    with enhanced error handling and performance monitoring.

    Args:
        agent_type: Type of AI agent to create
        config: Configuration dictionary containing required services and settings

    Returns:
        Instance of the requested agent type

    Raises:
        ValueError: If agent type is invalid or configuration is incomplete
        RuntimeError: If agent instantiation fails
    """
    try:
        # Validate agent type
        if agent_type not in AGENT_TYPES:
            raise ValueError(f"Invalid agent type: {agent_type}. Supported types: {AGENT_TYPES}")

        # Validate configuration
        required_services = {'langchain_service', 'openai_service'}
        missing_services = required_services - set(config.keys())
        if missing_services:
            raise ValueError(f"Missing required services in config: {missing_services}")

        # Get agent class
        agent_class = AVAILABLE_AGENTS[agent_type]

        # Create agent instance
        agent = agent_class(
            agent_data=config.get('agent_data'),
            langchain_service=config['langchain_service'],
            openai_service=config['openai_service']
        )

        # Update metrics
        AGENT_METRICS['agent_instances'].labels(agent_type=agent_type).inc()
        AGENT_METRICS['agent_creations'].labels(agent_type=agent_type).inc()

        # Register cleanup hook
        config.get('cleanup_registry', set()).add(
            lambda: cleanup_agent_resources(agent)
        )

        logger.info(f"Successfully created {agent_type} agent instance")
        return agent

    except Exception as e:
        logger.error(f"Failed to create {agent_type} agent: {str(e)}")
        raise RuntimeError(f"Agent instantiation failed: {str(e)}")

async def cleanup_agent_resources(agent: BaseAgent) -> None:
    """
    Ensures proper cleanup of agent resources and connections.

    Args:
        agent: Agent instance to cleanup

    Raises:
        RuntimeError: If cleanup fails
    """
    try:
        # Close any open connections
        if hasattr(agent, 'close') and callable(agent.close):
            await agent.close()

        # Clear agent context
        if hasattr(agent, 'context'):
            agent.context.clear()

        # Update metrics
        agent_type = agent.__class__.__name__.lower().replace('agent', '')
        AGENT_METRICS['agent_instances'].labels(agent_type=agent_type).dec()

        logger.info(f"Successfully cleaned up resources for {agent_type} agent")

    except Exception as e:
        logger.error(f"Error during agent cleanup: {str(e)}")
        raise RuntimeError(f"Agent cleanup failed: {str(e)}")

# Export public interface
__all__ = [
    'BaseAgent',
    'ExplorerAgent', 
    'FoodieAgent',
    'PlannerAgent',
    'get_agent_instance',
    'AGENT_TYPES'
]