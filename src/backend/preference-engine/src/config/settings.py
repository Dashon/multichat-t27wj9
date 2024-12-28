"""
Core configuration settings for the Preference Engine service.
Manages environment variables, database connections, learning parameters,
and service configuration with comprehensive validation and type safety.

Version: 1.0.0
"""

import os
from typing import Dict, List, Optional, Union, Any
from urllib.parse import urlparse
from pydantic import BaseSettings, Field, validator  # v2.4+

# Default configuration constants
DEFAULT_MODEL_UPDATE_INTERVAL = 3600  # Default model update interval in seconds
DEFAULT_LEARNING_RATE = 0.01  # Default learning rate for preference model
DEFAULT_PREFERENCE_HISTORY_LIMIT = 100  # Maximum preference history entries per user
DEFAULT_CACHE_EXPIRY = 3600  # Default cache expiry in seconds
SUPPORTED_PREFERENCE_TYPES = ['content', 'interaction', 'time', 'location']

class Settings(BaseSettings):
    """
    Comprehensive settings management for preference engine with validation and type safety.
    Handles configuration for database connections, learning parameters, and service settings.
    """
    
    # Database URIs with validation
    MONGODB_URI: str = Field(
        default=os.getenv('MONGODB_URI', 'mongodb://localhost:27017/preferences'),
        description="MongoDB connection URI with authentication"
    )
    
    REDIS_URI: str = Field(
        default=os.getenv('REDIS_URI', 'redis://localhost:6379/0'),
        description="Redis connection URI for caching"
    )
    
    # Learning and model parameters
    MODEL_UPDATE_INTERVAL: int = Field(
        default=DEFAULT_MODEL_UPDATE_INTERVAL,
        ge=60,  # Minimum 60 seconds
        le=86400,  # Maximum 24 hours
        description="Interval for model updates in seconds"
    )
    
    LEARNING_RATE: float = Field(
        default=DEFAULT_LEARNING_RATE,
        gt=0.0,
        le=1.0,
        description="Learning rate for preference model updates"
    )
    
    PREFERENCE_HISTORY_LIMIT: int = Field(
        default=DEFAULT_PREFERENCE_HISTORY_LIMIT,
        gt=0,
        le=1000,
        description="Maximum number of preference history entries per user"
    )
    
    CACHE_EXPIRY: int = Field(
        default=DEFAULT_CACHE_EXPIRY,
        ge=60,
        le=86400,
        description="Cache expiry time in seconds"
    )
    
    SUPPORTED_PREFERENCE_TYPES: List[str] = Field(
        default=SUPPORTED_PREFERENCE_TYPES,
        description="List of supported preference types"
    )
    
    # Monitoring configuration
    MONITORING_CONFIG: Dict[str, Any] = Field(
        default={
            'enabled': True,
            'log_level': 'INFO',
            'metrics_interval': 60,
            'performance_tracking': True,
            'error_reporting': True
        },
        description="Monitoring and observability configuration"
    )
    
    # Database specific options
    DATABASE_OPTIONS: Dict[str, str] = Field(
        default={
            'write_concern': 'majority',
            'read_preference': 'primaryPreferred',
            'max_pool_size': '100',
            'min_pool_size': '10',
            'max_idle_time_ms': '30000'
        },
        description="Database-specific configuration options"
    )

    @validator('MONGODB_URI', 'REDIS_URI')
    def validate_uris(cls, v: str, field: Field) -> str:
        """
        Validates database connection URIs for format and components.
        
        Args:
            v: URI string to validate
            field: Field information
            
        Returns:
            Validated URI string
            
        Raises:
            ValueError: If URI format is invalid
        """
        try:
            parsed = urlparse(v)
            
            # Validate scheme
            if field.name == 'MONGODB_URI' and parsed.scheme not in ['mongodb', 'mongodb+srv']:
                raise ValueError("Invalid MongoDB URI scheme")
            if field.name == 'REDIS_URI' and parsed.scheme != 'redis':
                raise ValueError("Invalid Redis URI scheme")
                
            # Validate hostname
            if not parsed.hostname:
                raise ValueError(f"Missing hostname in {field.name}")
                
            # Validate port if provided
            if parsed.port and (parsed.port < 1 or parsed.port > 65535):
                raise ValueError(f"Invalid port in {field.name}")
                
            return v
            
        except Exception as e:
            raise ValueError(f"Invalid {field.name}: {str(e)}")

    def get_cache_config(self) -> Dict[str, Any]:
        """
        Generates optimized Redis cache configuration.
        
        Returns:
            Dictionary containing complete cache configuration
        """
        return {
            'url': self.REDIS_URI,
            'expiry': self.CACHE_EXPIRY,
            'key_prefix': 'pref_engine:',
            'connection_pool': {
                'max_connections': 100,
                'min_connections': 10,
                'timeout': 20
            },
            'serializer': {
                'compression': True,
                'compression_level': 6
            },
            'policies': {
                'eviction': 'volatile-lru',
                'max_memory': '2gb'
            },
            'monitoring': {
                'commands': True,
                'latency': True
            }
        }

    def get_database_config(self) -> Dict[str, Any]:
        """
        Generates MongoDB database configuration.
        
        Returns:
            Dictionary containing complete database configuration
        """
        return {
            'uri': self.MONGODB_URI,
            'options': self.DATABASE_OPTIONS,
            'connection_pool': {
                'max_pool_size': int(self.DATABASE_OPTIONS['max_pool_size']),
                'min_pool_size': int(self.DATABASE_OPTIONS['min_pool_size']),
                'max_idle_time_ms': int(self.DATABASE_OPTIONS['max_idle_time_ms'])
            },
            'write_concern': {
                'w': self.DATABASE_OPTIONS['write_concern'],
                'j': True
            },
            'read_preference': self.DATABASE_OPTIONS['read_preference'],
            'retry_writes': True,
            'monitoring': {
                'command_monitoring': True,
                'server_monitoring': True,
                'topology_monitoring': True
            }
        }

    class Config:
        """Pydantic model configuration"""
        case_sensitive = True
        validate_assignment = True
        extra = 'forbid'
        env_prefix = 'PREF_ENGINE_'

# Create a global settings instance
settings = Settings()