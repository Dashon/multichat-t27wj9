"""
Message Model Module
Implements comprehensive data validation and serialization for AI-enhanced chat messages
with real-time processing capabilities and proto conversion.

Version: 1.0.0
"""

from datetime import datetime  # v3.11+
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field, UUID4  # v2.4.0

# Internal imports
from ..agents.base_agent import AgentType

class MessageMetadata(BaseModel):
    """
    Enhanced message metadata model with AI-specific attributes and validation.
    
    Attributes:
        message_type: Type of message (text, system, ai_response)
        formatting: Message formatting options
        mentions: List of mentioned users or AI agents
        ai_context: AI-specific context and processing data
        vector_embeddings: Optional vector embeddings for similarity search
        sentiment_analysis: Optional sentiment analysis results
    """
    
    message_type: str = Field(
        default="text",
        pattern="^(text|system|ai_response)$",
        description="Type of message"
    )
    
    formatting: Dict[str, str] = Field(
        default_factory=dict,
        description="Message formatting options"
    )
    
    mentions: List[str] = Field(
        default_factory=list,
        description="List of mentioned users or AI agents"
    )
    
    ai_context: Dict[str, Any] = Field(
        default_factory=dict,
        description="AI-specific context and processing data"
    )
    
    vector_embeddings: Optional[Dict[str, float]] = Field(
        default=None,
        description="Vector embeddings for similarity search"
    )
    
    sentiment_analysis: Optional[Dict[str, str]] = Field(
        default=None,
        description="Sentiment analysis results"
    )

    def has_ai_mention(self) -> bool:
        """
        Enhanced check for AI agent mentions with validation.
        
        Returns:
            bool: True if message contains valid AI agent mention
        """
        if not self.mentions:
            return False
            
        # Check for valid AI agent mentions
        ai_prefixes = {"@explorer", "@foodie", "@planner"}
        for mention in self.mentions:
            if mention.lower() in ai_prefixes:
                agent_type = mention[1:].upper()  # Remove @ and convert to uppercase
                if hasattr(AgentType, agent_type):
                    return True
        return False

    def extract_ai_context(self) -> Dict[str, Any]:
        """
        Extracts and validates AI-specific context.
        
        Returns:
            dict: Processed AI context dictionary
        """
        context = {
            "has_ai_mention": self.has_ai_mention(),
            "processing_required": False,
            "agent_context": {},
            "embeddings": self.vector_embeddings,
            "sentiment": self.sentiment_analysis
        }
        
        if self.has_ai_mention():
            context["processing_required"] = True
            context["agent_context"] = {
                "mentioned_agents": [
                    mention[1:].upper()
                    for mention in self.mentions
                    if mention.startswith("@") and 
                    hasattr(AgentType, mention[1:].upper())
                ],
                "context_data": self.ai_context
            }
            
        return context

class Message(BaseModel):
    """
    Core message model with enhanced AI processing capabilities.
    
    Attributes:
        id: Unique message identifier
        chat_id: Chat/conversation identifier
        sender_id: Message sender identifier
        content: Message content
        thread_id: Optional thread identifier for threaded conversations
        timestamp: Message creation timestamp
        metadata: Enhanced message metadata
        processing_priority: Optional priority for AI processing
    """
    
    id: UUID4 = Field(
        description="Unique message identifier"
    )
    
    chat_id: UUID4 = Field(
        description="Chat/conversation identifier"
    )
    
    sender_id: UUID4 = Field(
        description="Message sender identifier"
    )
    
    content: str = Field(
        min_length=1,
        max_length=4096,
        description="Message content"
    )
    
    thread_id: Optional[UUID4] = Field(
        default=None,
        description="Thread identifier for threaded conversations"
    )
    
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Message creation timestamp"
    )
    
    metadata: MessageMetadata = Field(
        default_factory=MessageMetadata,
        description="Enhanced message metadata"
    )
    
    processing_priority: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Priority for AI processing (0.0-1.0)"
    )

    def to_proto(self) -> 'ChatMessage':
        """
        Optimized conversion to protobuf format.
        
        Returns:
            ChatMessage: Protobuf message format
        """
        # Validate all fields before conversion
        self.model_validate(self)
        
        # Extract AI context
        ai_context = self.metadata.extract_ai_context()
        
        # Convert to proto format
        return {
            "id": str(self.id),
            "chat_id": str(self.chat_id),
            "sender_id": str(self.sender_id),
            "content": self.content,
            "thread_id": str(self.thread_id) if self.thread_id else None,
            "timestamp": int(self.timestamp.timestamp()),
            "metadata": {
                "message_type": self.metadata.message_type,
                "formatting": self.metadata.formatting,
                "mentions": self.metadata.mentions,
                "ai_context": ai_context,
                "vector_embeddings": self.metadata.vector_embeddings,
                "sentiment_analysis": self.metadata.sentiment_analysis
            },
            "processing_priority": self.processing_priority
        }

    @classmethod
    def from_proto(cls, proto_msg: 'ChatMessage') -> 'Message':
        """
        Creates message from protobuf with validation.
        
        Args:
            proto_msg: Protobuf message format
            
        Returns:
            Message: Validated Message instance
        """
        # Extract and validate all fields
        metadata = MessageMetadata(
            message_type=proto_msg["metadata"]["message_type"],
            formatting=proto_msg["metadata"]["formatting"],
            mentions=proto_msg["metadata"]["mentions"],
            ai_context=proto_msg["metadata"]["ai_context"],
            vector_embeddings=proto_msg["metadata"]["vector_embeddings"],
            sentiment_analysis=proto_msg["metadata"]["sentiment_analysis"]
        )
        
        # Create and validate message instance
        message = cls(
            id=UUID4(proto_msg["id"]),
            chat_id=UUID4(proto_msg["chat_id"]),
            sender_id=UUID4(proto_msg["sender_id"]),
            content=proto_msg["content"],
            thread_id=UUID4(proto_msg["thread_id"]) if proto_msg["thread_id"] else None,
            timestamp=datetime.fromtimestamp(proto_msg["timestamp"]),
            metadata=metadata,
            processing_priority=proto_msg.get("processing_priority")
        )
        
        return message

    def get_ai_context(self) -> Dict[str, Any]:
        """
        Enhanced AI context extraction with validation.
        
        Returns:
            dict: Validated AI context dictionary
        """
        # Get base context
        context = self.metadata.extract_ai_context()
        
        # Add message-level context
        context.update({
            "message_id": str(self.id),
            "chat_id": str(self.chat_id),
            "timestamp": self.timestamp.isoformat(),
            "is_threaded": bool(self.thread_id),
            "priority": self.processing_priority or 0.5
        })
        
        # Add security context
        context["security"] = {
            "is_system_message": self.metadata.message_type == "system",
            "has_special_formatting": bool(self.metadata.formatting),
            "content_length": len(self.content)
        }
        
        return context