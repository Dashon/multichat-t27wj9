# Python 3.11+
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from uuid import uuid4
from datetime import datetime, timezone

# List of supported agent specialization types
AGENT_TYPES = ["explorer", "foodie", "planner", "budget", "local"]

# Default capabilities for all agents
DEFAULT_CAPABILITIES = {
    "text_processing": True,
    "context_awareness": True,
    "proactive_suggestions": False,
    "group_coordination": True
}

# Default configuration settings
DEFAULT_CONFIG = {
    "response_timeout": 30,  # seconds
    "context_window": 1000,  # tokens
    "max_tokens": 500,      # tokens
    "temperature": 0.7      # response randomness
}

@dataclass
class Agent:
    """
    Data model representing an AI agent in the system.
    
    Attributes:
        id (str): Unique identifier for the agent
        name (str): Display name of the agent
        specialties (List[str]): List of agent specializations
        capabilities (Dict[str, bool]): Feature flags for agent capabilities
        config (Dict[str, Any]): Configuration parameters
        created_at (datetime): UTC timestamp of agent creation
        last_active (datetime): UTC timestamp of last activity
        is_active (bool): Current operational status
        performance_metrics (Dict[str, float]): Performance tracking metrics
    """
    
    name: str
    specialties: List[str]
    capabilities: Dict[str, bool] = field(default_factory=lambda: DEFAULT_CAPABILITIES.copy())
    config: Dict[str, Any] = field(default_factory=lambda: DEFAULT_CONFIG.copy())
    id: str = field(default_factory=lambda: str(uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    performance_metrics: Dict[str, float] = field(default_factory=dict)

    def __post_init__(self):
        """Validates agent initialization parameters."""
        # Validate name
        if not isinstance(self.name, str) or not 3 <= len(self.name) <= 50:
            raise ValueError("Agent name must be between 3 and 50 characters")

        # Validate specialties
        self.validate_specialties(self.specialties)

        # Merge and validate capabilities
        self.capabilities = {**DEFAULT_CAPABILITIES, **self.capabilities}
        if not all(isinstance(v, bool) for v in self.capabilities.values()):
            raise ValueError("All capability values must be boolean")

        # Merge and validate config
        self.config = {**DEFAULT_CONFIG, **self.config}
        self._validate_config()

        # Initialize performance metrics
        self.performance_metrics = {
            "response_time_avg": 0.0,
            "success_rate": 100.0,
            "user_satisfaction": 0.0,
            "request_count": 0
        }

    @staticmethod
    def validate_specialties(specialties: List[str]) -> bool:
        """
        Validates that agent specialties are supported and compatible.
        
        Args:
            specialties: List of specialty identifiers
            
        Returns:
            bool: True if specialties are valid
            
        Raises:
            ValueError: If specialties are invalid or incompatible
        """
        if not isinstance(specialties, list) or not specialties:
            raise ValueError("At least one specialty must be specified")

        if len(specialties) > 3:
            raise ValueError("Maximum of 3 specialties allowed per agent")

        invalid_specialties = set(specialties) - set(AGENT_TYPES)
        if invalid_specialties:
            raise ValueError(f"Invalid specialties: {invalid_specialties}")

        # Check for incompatible specialty combinations
        if "budget" in specialties and "local" in specialties:
            raise ValueError("'budget' and 'local' specialties cannot be combined")

        return True

    def _validate_config(self) -> None:
        """Validates configuration parameters against acceptable ranges."""
        if not 1 <= self.config["response_timeout"] <= 60:
            raise ValueError("response_timeout must be between 1 and 60 seconds")
        
        if not 100 <= self.config["context_window"] <= 2000:
            raise ValueError("context_window must be between 100 and 2000 tokens")
            
        if not 50 <= self.config["max_tokens"] <= 1000:
            raise ValueError("max_tokens must be between 50 and 1000")
            
        if not 0.1 <= self.config["temperature"] <= 1.0:
            raise ValueError("temperature must be between 0.1 and 1.0")

    def update_last_active(self) -> None:
        """Updates the last active timestamp to current UTC time."""
        self.last_active = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """
        Converts agent instance to dictionary format for serialization.
        
        Returns:
            Dict[str, Any]: Dictionary representation of the agent
        """
        return {
            "id": self.id,
            "name": self.name,
            "specialties": self.specialties,
            "capabilities": self.capabilities,
            "config": self.config,
            "created_at": self.created_at.isoformat(),
            "last_active": self.last_active.isoformat(),
            "is_active": self.is_active,
            "performance_metrics": self.performance_metrics
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Agent':
        """
        Creates an agent instance from a dictionary representation.
        
        Args:
            data: Dictionary containing agent data
            
        Returns:
            Agent: New agent instance
            
        Raises:
            ValueError: If data is invalid or missing required fields
        """
        required_fields = {"name", "specialties"}
        missing_fields = required_fields - set(data.keys())
        if missing_fields:
            raise ValueError(f"Missing required fields: {missing_fields}")

        # Parse timestamps if present
        if "created_at" in data:
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        if "last_active" in data:
            data["last_active"] = datetime.fromisoformat(data["last_active"])

        return cls(
            name=data["name"],
            specialties=data["specialties"],
            capabilities=data.get("capabilities", {}),
            config=data.get("config", {}),
            id=data.get("id", str(uuid4())),
            created_at=data.get("created_at", datetime.now(timezone.utc)),
            last_active=data.get("last_active", datetime.now(timezone.utc)),
            is_active=data.get("is_active", True),
            performance_metrics=data.get("performance_metrics", {})
        )