from pydantic import BaseSettings, Field  # v2.4+
from python_dotenv import load_dotenv  # v1.0+
import os
import threading
from typing import List, Optional

# Global settings instance for singleton pattern
_settings_instance = None
_settings_lock = threading.Lock()

class Settings(BaseSettings):
    """
    Configuration settings for the AI Orchestrator service with comprehensive validation.
    Manages environment variables, service configuration, and integration settings.
    """
    
    # Application Settings
    app_name: str = Field(
        default="AI-Enhanced Group Chat Platform - AI Service",
        description="Name of the AI service application"
    )
    version: str = Field(
        default="1.0.0",
        description="Service version number"
    )
    environment: str = Field(
        default="development",
        regex="^(development|staging|production)$",
        description="Current deployment environment"
    )

    # AI Integration Settings
    openai_api_key: str = Field(
        ...,  # Required field
        description="OpenAI API key for AI model access",
        min_length=20
    )
    context_window_size: int = Field(
        default=4096,
        ge=1024,
        le=8192,
        description="Size of AI context window in tokens"
    )
    response_timeout: float = Field(
        default=5.0,
        ge=1.0,
        le=30.0,
        description="Maximum time for AI response in seconds"
    )
    max_tokens: int = Field(
        default=2048,
        ge=1,
        le=4096,
        description="Maximum tokens for AI response"
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="AI response randomness factor"
    )

    # Vector Database Settings
    milvus_host: str = Field(
        default="localhost",
        description="Host address for Milvus vector database"
    )
    milvus_port: int = Field(
        default=19530,
        ge=1,
        le=65535,
        description="Port number for Milvus connection"
    )

    # Cache Settings
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL for caching",
        regex="^redis://.*"
    )

    # Security Settings
    allowed_origins: List[str] = Field(
        default=["http://localhost:3000"],
        description="CORS allowed origins list",
        min_items=1
    )

    # Performance Settings
    request_timeout: float = Field(
        default=2.0,
        ge=0.5,
        le=10.0,
        description="Maximum time for HTTP requests in seconds"
    )
    max_retries: int = Field(
        default=3,
        ge=0,
        le=5,
        description="Maximum number of retry attempts"
    )
    batch_size: int = Field(
        default=100,
        ge=10,
        le=1000,
        description="Batch size for vector operations"
    )

    class Config:
        """Pydantic model configuration"""
        case_sensitive = False
        env_file = f".env.{os.getenv('ENVIRONMENT', 'development')}"
        env_file_encoding = 'utf-8'
        env_prefix = "AI_SERVICE_"
        validate_assignment = True
        extra = "forbid"
        
        @classmethod
        def customise_sources(
            cls,
            init_settings,
            env_settings,
            file_secret_settings
        ):
            """Customize settings loading priority"""
            return (
                init_settings,
                env_settings,
                file_secret_settings,
            )

    def __init__(self, **kwargs):
        """Initialize settings with environment variables and validation"""
        # Load environment variables
        load_dotenv(self.Config.env_file)
        
        # Initialize with environment variables or defaults
        super().__init__(**kwargs)
        
        # Validate environment-specific settings
        if self.environment == "production":
            assert self.openai_api_key, "OpenAI API key is required in production"
            assert "localhost" not in self.allowed_origins, "Production must use proper domains"

def get_settings() -> Settings:
    """
    Thread-safe factory function to retrieve singleton settings instance.
    Returns:
        Settings: Validated singleton settings instance
    """
    global _settings_instance
    
    if _settings_instance is None:
        with _settings_lock:
            if _settings_instance is None:
                _settings_instance = Settings()
    
    return _settings_instance

# Export settings class and factory function
__all__ = ["Settings", "get_settings"]