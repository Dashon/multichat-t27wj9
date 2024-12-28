# Python 3.11+
import pytest
from pytest import fixture, mark

# Test metadata configuration for AI service test suite
TEST_METADATA = {
    'service_name': 'ai-service',
    'test_markers': [
        'unit',
        'integration', 
        'e2e',
        'performance',
        'async'
    ],
    'test_categories': [
        'agents',
        'context',
        'api',
        'vector_embeddings',
        'agent_specialization',
        'response_generation',
        'context_management'
    ],
    'agent_types': [
        'explorer',
        'foodie', 
        'planner',
        'budget',
        'local'
    ],
    'performance_thresholds': {
        'ai_response_time': 5000,  # ms
        'context_lookup': 100,     # ms
        'vector_embedding': 200    # ms
    },
    'vector_config': {
        'embedding_dimensions': 1536,
        'similarity_threshold': 0.85
    }
}

# Enable automatic loading of test fixtures from conftest.py
pytest_plugins = ['conftest']

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure pytest environment for AI service testing with comprehensive setup for
    agent testing, async operations, and performance monitoring.

    Args:
        config: pytest configuration object
    """
    # Register standard test markers
    for marker in TEST_METADATA['test_markers']:
        config.addinivalue_line(
            "markers",
            f"{marker}: mark test as {marker} test"
        )

    # Register agent-specific test markers
    for agent_type in TEST_METADATA['agent_types']:
        config.addinivalue_line(
            "markers",
            f"agent_{agent_type}: mark test as specific to {agent_type} agent"
        )

    # Register test category markers
    for category in TEST_METADATA['test_categories']:
        config.addinivalue_line(
            "markers",
            f"{category}: mark test as {category} related"
        )

    # Configure test environment
    config.option.strict_markers = True
    config.option.asyncio_mode = "auto"

    # Set test coverage requirements
    config.option.cov_fail_under = 80
    config.option.cov_branch = True

    # Configure performance test thresholds
    for metric, threshold in TEST_METADATA['performance_thresholds'].items():
        config.addinivalue_line(
            "performance_thresholds",
            f"{metric}={threshold}"
        )

    # Configure vector embedding test parameters
    config.addinivalue_line(
        "vector_config",
        f"embedding_dimensions={TEST_METADATA['vector_config']['embedding_dimensions']}"
    )
    config.addinivalue_line(
        "vector_config",
        f"similarity_threshold={TEST_METADATA['vector_config']['similarity_threshold']}"
    )

    # Register custom test result fields for AI-specific metrics
    config.addinivalue_line(
        "report_fields",
        "ai_response_accuracy=float"
    )
    config.addinivalue_line(
        "report_fields",
        "context_relevance=float"
    )
    config.addinivalue_line(
        "report_fields",
        "agent_specialization_accuracy=float"
    )