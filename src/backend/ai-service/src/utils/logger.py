import logging
import json_logging  # v1.0.0
from datetime import datetime
from typing import Dict, Optional
import threading
import queue
from logging.handlers import RotatingFileHandler
import traceback
import socket
import uuid
from config.settings import get_settings

# Global logger instance cache
_logger_cache = {}
_logger_lock = threading.Lock()

# Constants
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
LOG_LEVELS = {
    "development": "DEBUG",
    "staging": "INFO",
    "production": "WARNING"
}

class CustomJSONFormatter:
    """
    Production-ready JSON formatter with enhanced features for structured logging and monitoring.
    Provides optimized formatting with sensitive data masking and metric tracking.
    """
    
    RESERVED_ATTRS = {
        'args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
        'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs',
        'msg', 'name', 'pathname', 'process', 'processName', 'relativeCreated',
        'stack_info', 'thread', 'threadName'
    }
    
    SENSITIVE_FIELDS = {
        'password', 'token', 'secret', 'api_key', 'credential',
        'authorization', 'access_token', 'refresh_token'
    }
    
    METRIC_FIELDS = {
        'duration_ms', 'memory_usage', 'cpu_usage', 'request_id',
        'correlation_id', 'trace_id'
    }

    def __init__(self, extra_fields: Optional[Dict] = None):
        """
        Initialize the JSON formatter with production settings.
        
        Args:
            extra_fields (Optional[Dict]): Additional fields to include in all log entries
        """
        self.extra_fields = extra_fields or {}
        self.hostname = socket.gethostname()
        self.version = get_settings().version
        self.environment = get_settings().environment

    def format(self, record: logging.LogRecord) -> str:
        """
        Formats log record into production-ready JSON structure with enhanced features.
        
        Args:
            record (logging.LogRecord): Log record to format
            
        Returns:
            str: Optimized JSON-formatted log entry
        """
        log_data = {
            'timestamp': datetime.utcfromtimestamp(record.created).isoformat() + 'Z',
            'logger': record.name,
            'level': record.levelname,
            'message': record.getMessage(),
            'environment': self.environment,
            'version': self.version,
            'hostname': self.hostname,
            'service': 'ai-service'
        }

        # Add error information if present
        if record.exc_info:
            log_data['error'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'stacktrace': traceback.format_exception(*record.exc_info)
            }

        # Add extra fields from record
        for key, value in record.__dict__.items():
            if key not in self.RESERVED_ATTRS:
                log_data[key] = value

        # Add correlation ID if available
        if hasattr(record, 'correlation_id'):
            log_data['correlation_id'] = record.correlation_id
        
        # Add custom extra fields
        log_data.update(self.extra_fields)

        # Sanitize sensitive data
        sanitized_data = self.sanitize_log(log_data)

        return json.dumps(sanitized_data, default=str)

    def sanitize_log(self, log_data: Dict) -> Dict:
        """
        Sanitizes log data to remove sensitive information.
        
        Args:
            log_data (Dict): Raw log data
            
        Returns:
            Dict: Sanitized log data
        """
        sanitized = {}
        for key, value in log_data.items():
            if any(sensitive in key.lower() for sensitive in self.SENSITIVE_FIELDS):
                sanitized[key] = '***REDACTED***'
            elif isinstance(value, dict):
                sanitized[key] = self.sanitize_log(value)
            else:
                sanitized[key] = value
        return sanitized

def setup_logging(config_override: Optional[Dict] = None) -> logging.Logger:
    """
    Configures production-grade logging with environment-specific settings.
    
    Args:
        config_override (Optional[Dict]): Override default logging configuration
        
    Returns:
        logging.Logger: Fully configured logger instance
    """
    settings = get_settings()
    config = {
        'level': LOG_LEVELS.get(settings.environment, 'INFO'),
        'format': LOG_FORMAT,
        'json_enabled': settings.environment != 'development',
        'rotation_size': 10 * 1024 * 1024,  # 10MB
        'backup_count': 5
    }
    
    if config_override:
        config.update(config_override)

    # Initialize JSON logging for ELK Stack integration
    if config['json_enabled']:
        json_logging.init_non_web()

    # Create root logger
    logger = logging.getLogger('ai_service')
    logger.setLevel(config['level'])
    logger.handlers = []  # Remove existing handlers

    # Console handler with appropriate formatter
    console_handler = logging.StreamHandler()
    if config['json_enabled']:
        formatter = CustomJSONFormatter()
    else:
        formatter = logging.Formatter(config['format'])
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler with rotation
    if settings.environment != 'development':
        file_handler = RotatingFileHandler(
            filename=f'logs/ai-service-{settings.environment}.log',
            maxBytes=config['rotation_size'],
            backupCount=config['backup_count']
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    # Set up async logging for performance in production
    if settings.environment == 'production':
        for handler in logger.handlers:
            handler.setLevel(logging.WARNING)
            
    return logger

def get_logger(module_name: str, context: Optional[Dict] = None) -> logging.Logger:
    """
    Returns a configured logger instance with module-specific context.
    
    Args:
        module_name (str): Name of the module requesting the logger
        context (Optional[Dict]): Additional context to include in logs
        
    Returns:
        logging.Logger: Module-specific logger instance
    """
    global _logger_cache

    if not module_name:
        raise ValueError("Module name is required")

    # Check cache for existing logger
    cache_key = f"{module_name}:{hash(str(context))}"
    with _logger_lock:
        if cache_key in _logger_cache:
            return _logger_cache[cache_key]

        # Create new logger instance
        logger = logging.getLogger(f'ai_service.{module_name}')
        
        # Add context as extra fields
        if context:
            logger = logging.LoggerAdapter(logger, context)

        # Cache the logger instance
        _logger_cache[cache_key] = logger

        return logger

# Export logging utilities
__all__ = ['setup_logging', 'get_logger', 'CustomJSONFormatter']