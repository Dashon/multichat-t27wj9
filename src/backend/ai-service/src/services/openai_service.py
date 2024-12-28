"""
OpenAI Service Module
Provides a high-level interface for OpenAI API interactions with enterprise-ready features
including error handling, rate limiting, monitoring, and context management.

Version: 1.0.0
"""

import asyncio
import logging
import time
from typing import Optional, Dict, List
import numpy as np

# External imports with versions
import openai  # v1.3.0
from tenacity import retry, stop_after_attempt, wait_exponential  # v8.2.0
from httpx import AsyncClient, TimeoutException  # v0.25.0
import numpy as np  # v1.24.0

# Internal imports
from ..config.settings import Settings

# Constants
MODEL_GPT4 = "gpt-4"
MODEL_GPT35 = "gpt-3.5-turbo"
EMBEDDING_MODEL = "text-embedding-ada-002"
MAX_RETRIES = 3
RETRY_WAIT_MULTIPLIER = 2
MAX_RETRY_WAIT = 10

# Configure logging
logger = logging.getLogger(__name__)

def validate_request(func):
    """Decorator for validating API requests and handling errors"""
    async def wrapper(self, *args, **kwargs):
        try:
            start_time = time.time()
            result = await func(self, *args, **kwargs)
            duration = time.time() - start_time
            
            # Update request statistics
            self._request_stats['total_requests'] += 1
            self._request_stats['total_duration'] += duration
            self._request_stats['avg_duration'] = (
                self._request_stats['total_duration'] / 
                self._request_stats['total_requests']
            )
            
            logger.info(
                f"OpenAI request completed: {func.__name__}, "
                f"duration: {duration:.2f}s, "
                f"avg: {self._request_stats['avg_duration']:.2f}s"
            )
            return result
            
        except TimeoutException as e:
            self._request_stats['timeouts'] += 1
            logger.error(f"OpenAI request timeout: {str(e)}")
            raise
        except openai.error.RateLimitError as e:
            self._request_stats['rate_limits'] += 1
            logger.error(f"OpenAI rate limit exceeded: {str(e)}")
            raise
        except Exception as e:
            self._request_stats['errors'] += 1
            logger.error(f"OpenAI request error: {str(e)}")
            raise
            
    return wrapper

class OpenAIService:
    """
    Service class for handling OpenAI API interactions with enterprise-ready features
    including error handling, retries, monitoring, and performance optimization.
    """
    
    def __init__(self, settings: Settings):
        """
        Initialize OpenAI service with configuration and monitoring setup.
        
        Args:
            settings: Application settings instance
        """
        self._settings = settings
        self._client = AsyncClient(
            timeout=settings.request_timeout,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
        )
        
        # Configure OpenAI client
        openai.api_key = settings.openai_api_key
        
        # Initialize request monitoring
        self._request_stats = {
            'total_requests': 0,
            'total_duration': 0.0,
            'avg_duration': 0.0,
            'timeouts': 0,
            'rate_limits': 0,
            'errors': 0
        }
        self._last_request_time = 0.0
        
        logger.info("OpenAI service initialized with monitoring")

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_WAIT_MULTIPLIER, max=MAX_RETRY_WAIT)
    )
    @validate_request
    async def generate_completion(
        self,
        prompt: str,
        model_name: str = MODEL_GPT35,
        context: Optional[List[Dict]] = None,
        temperature: Optional[float] = None
    ) -> str:
        """
        Generate text completion using OpenAI API with context management.
        
        Args:
            prompt: Input text prompt
            model_name: OpenAI model identifier
            context: Optional conversation context
            temperature: Optional temperature override
            
        Returns:
            Generated completion text
            
        Raises:
            ValueError: For invalid input parameters
            TimeoutException: When request times out
            openai.error.OpenAIError: For API-specific errors
        """
        if not prompt:
            raise ValueError("Prompt cannot be empty")
            
        # Prepare messages with context
        messages = []
        if context:
            messages.extend(context)
        messages.append({"role": "user", "content": prompt})
        
        # Use settings temperature if not overridden
        temp = temperature if temperature is not None else self._settings.temperature
        
        try:
            response = await openai.ChatCompletion.acreate(
                model=model_name,
                messages=messages,
                temperature=temp,
                max_tokens=self._settings.max_tokens,
                timeout=self._settings.response_timeout
            )
            
            if not response.choices:
                raise ValueError("No completion choices returned")
                
            completion_text = response.choices[0].message.content.strip()
            return completion_text
            
        except Exception as e:
            logger.error(f"Completion generation error: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_WAIT_MULTIPLIER, max=MAX_RETRY_WAIT)
    )
    @validate_request
    async def generate_embedding(self, text: str) -> np.ndarray:
        """
        Generate vector embedding for text using OpenAI API with optimization.
        
        Args:
            text: Input text for embedding
            
        Returns:
            Vector embedding as numpy array
            
        Raises:
            ValueError: For invalid input
            TimeoutException: When request times out
            openai.error.OpenAIError: For API-specific errors
        """
        if not text:
            raise ValueError("Text cannot be empty")
            
        try:
            response = await openai.Embedding.acreate(
                model=EMBEDDING_MODEL,
                input=text,
                timeout=self._settings.request_timeout
            )
            
            if not response.data:
                raise ValueError("No embedding data returned")
                
            embedding = np.array(response.data[0].embedding)
            
            # Validate embedding dimensions
            if embedding.shape[0] != 1536:  # Ada-002 embedding size
                raise ValueError(f"Unexpected embedding dimension: {embedding.shape[0]}")
                
            return embedding
            
        except Exception as e:
            logger.error(f"Embedding generation error: {str(e)}")
            raise

    async def close(self) -> None:
        """
        Close HTTP client and perform cleanup with final stats logging.
        """
        logger.info(
            "OpenAI service final stats: "
            f"total_requests={self._request_stats['total_requests']}, "
            f"avg_duration={self._request_stats['avg_duration']:.2f}s, "
            f"timeouts={self._request_stats['timeouts']}, "
            f"rate_limits={self._request_stats['rate_limits']}, "
            f"errors={self._request_stats['errors']}"
        )
        
        await self._client.aclose()
        self._request_stats = {}
        self._last_request_time = 0.0

# Export OpenAI service class
__all__ = ["OpenAIService"]