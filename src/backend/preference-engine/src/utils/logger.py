"""
Advanced logging utility module for the Preference Engine service.
Provides structured JSON logging, performance tracking, and ELK Stack integration.

Version: 1.0.0
"""

import logging
import json_logging  # v1.0+
import datetime
import logging.handlers
import os
import uuid
from typing import Dict, Any, Optional
from config.settings import Settings

# Global logger instance
logger = logging.getLogger('preference_engine')

# Logging format constants
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(correlation_id)s - %(message)s'
LOG_DATE_FORMAT = '%Y-%m-%d %H:%M:%S.%f'
DEFAULT_LOG_LEVEL = logging.INFO

class PreferenceEngineJSONFormatter(logging.Formatter):
    """
    Advanced JSON formatter with preference engine specific fields,
    performance metrics, and ELK Stack compatibility.
    """
    
    RESERVED_ATTRS = {
        'args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
        'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs',
        'msg', 'name', 'pathname', 'process', 'processName', 'relativeCreated',
        'stack_info', 'thread', 'threadName'
    }
    
    PERFORMANCE_METRICS = {
        'execution_time_ms', 'memory_usage_mb', 'cpu_utilization',
        'db_query_time_ms', 'cache_hit_ratio'
    }
    
    CONTEXT_FIELDS = {
        'correlation_id', 'user_id', 'request_id', 'environment',
        'service', 'version'
    }
    
    def __init__(self, extra_fields: Optional[Dict[str, Any]] = None):
        """
        Initialize the JSON formatter with custom fields and performance tracking.
        
        Args:
            extra_fields: Additional fields to include in log output
        """
        super().__init__()
        self.extra_fields = extra_fields or {}
        json_logging.init_non_web()
    
    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record into comprehensive JSON structure with all required fields.
        
        Args:
            record: Log record to format
            
        Returns:
            Formatted JSON log entry
        """
        log_data = {
            'timestamp': self.formatTime(record, self.datefmt or LOG_DATE_FORMAT),
            'logger': record.name,
            'level': record.levelname,
            'environment': Settings.ENVIRONMENT,
            'correlation_id': getattr(record, 'correlation_id', str(uuid.uuid4())),
            'message': record.getMessage()
        }
        
        # Add error details if present
        if record.exc_info:
            log_data['error'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'stack_trace': self.formatException(record.exc_info)
            }
        
        # Add performance metrics
        self.add_performance_metrics(log_data, record)
        
        # Add extra context fields
        for field in self.CONTEXT_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                log_data[field] = value
        
        # Add custom extra fields
        for key, value in self.extra_fields.items():
            if key not in self.RESERVED_ATTRS:
                log_data[key] = value
        
        return json.dumps(log_data)
    
    def add_performance_metrics(self, log_data: Dict[str, Any], record: logging.LogRecord) -> Dict[str, Any]:
        """
        Add performance tracking metrics to log record.
        
        Args:
            log_data: Current log data dictionary
            record: Log record to enhance
            
        Returns:
            Updated log data with metrics
        """
        metrics = {}
        
        # Add execution time if available
        if hasattr(record, 'execution_time_ms'):
            metrics['execution_time_ms'] = record.execution_time_ms
        
        # Add memory usage if available
        if hasattr(record, 'memory_usage_mb'):
            metrics['memory_usage_mb'] = record.memory_usage_mb
        
        # Add CPU utilization if available
        if hasattr(record, 'cpu_utilization'):
            metrics['cpu_utilization'] = record.cpu_utilization
        
        # Add database timing if available
        if hasattr(record, 'db_query_time_ms'):
            metrics['db_query_time_ms'] = record.db_query_time_ms
        
        if metrics:
            log_data['performance_metrics'] = metrics
        
        return log_data

def setup_logging(log_level: str = None, log_file_path: str = None) -> logging.Logger:
    """
    Configure comprehensive logging system with environment-specific settings.
    
    Args:
        log_level: Optional override for log level
        log_file_path: Optional path for log file
        
    Returns:
        Configured logger instance
    """
    # Determine log level
    level = getattr(logging, log_level or Settings.LOG_LEVEL, DEFAULT_LOG_LEVEL)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Clear any existing handlers
    root_logger.handlers = []
    
    # Create JSON formatter
    json_formatter = PreferenceEngineJSONFormatter(extra_fields={
        'service': 'preference_engine',
        'version': '1.0.0'
    })
    
    # Configure console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(json_formatter)
    root_logger.addHandler(console_handler)
    
    # Configure file handler if path provided
    if log_file_path:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=log_file_path,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setFormatter(json_formatter)
        root_logger.addHandler(file_handler)
    
    # Configure async handler for high throughput
    if Settings.ENVIRONMENT == 'production':
        async_handler = logging.handlers.QueueHandler(logging.handlers.QueueListener())
        async_handler.setFormatter(json_formatter)
        root_logger.addHandler(async_handler)
    
    return logger

def get_logger(module_name: str, context: Dict[str, Any] = None) -> logging.Logger:
    """
    Create or retrieve a module-specific logger with context propagation.
    
    Args:
        module_name: Name of the module requesting logger
        context: Optional context dictionary to attach to logs
        
    Returns:
        Configured module-specific logger
    """
    module_logger = logging.getLogger(f'preference_engine.{module_name}')
    
    # Add context adapter if context provided
    if context:
        class ContextAdapter(logging.LoggerAdapter):
            def process(self, msg, kwargs):
                kwargs['extra'] = kwargs.get('extra', {})
                kwargs['extra'].update(self.extra)
                return msg, kwargs
        
        module_logger = ContextAdapter(module_logger, context)
    
    return module_logger

# Export public interface
__all__ = ['setup_logging', 'get_logger', 'PreferenceEngineJSONFormatter']