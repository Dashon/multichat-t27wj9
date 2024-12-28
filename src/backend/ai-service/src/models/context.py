from dataclasses import dataclass  # v3.11+
from datetime import datetime, timedelta  # v3.11+
from typing import Dict, List, Any, Tuple  # v3.11+
import numpy as np  # v1.24+

# Configuration constants
MAX_SHORT_TERM_MESSAGES = 50  # Maximum number of messages to retain in short-term memory
MAX_CONTEXT_AGE_HOURS = 24  # Maximum age of context before considered stale
EMBEDDING_DIMENSION = 1536  # Standard dimension for vector embeddings

@dataclass
class Context:
    """
    Manages conversation context data including message history, embeddings, and group dynamics analysis.
    
    Attributes:
        chat_id (str): Unique identifier for the chat/conversation
        short_term_memory (List[Dict]): Recent message history with FIFO policy
        embeddings (Dict[str, np.ndarray]): Message embeddings for vector operations
        group_dynamics (Dict[str, Any]): Enhanced group interaction metrics
        last_updated (datetime): Timestamp of last context update
    """
    
    chat_id: str
    short_term_memory: List[Dict]
    embeddings: Dict[str, np.ndarray]
    group_dynamics: Dict[str, Any]
    last_updated: datetime

    def __init__(self, chat_id: str):
        """
        Initialize a new context instance with empty data structures.
        
        Args:
            chat_id (str): Unique identifier for the chat/conversation
        """
        self.chat_id = chat_id
        self.short_term_memory = []
        self.embeddings = {}
        self.group_dynamics = {
            'participation_metrics': {},  # Track user participation frequency
            'response_times': {},        # Track average response latency
            'interaction_pairs': {},     # Track who interacts with whom
            'topic_flow': [],           # Track conversation topic transitions
        }
        self.last_updated = datetime.utcnow()

    def add_message(self, message: Dict) -> None:
        """
        Add a new message to context and update relevant metrics.
        
        Args:
            message (Dict): Message data including id, sender, content, and timestamp
        
        Raises:
            ValueError: If message is missing required fields
        """
        required_fields = {'message_id', 'sender_id', 'content', 'timestamp'}
        if not all(field in message for field in required_fields):
            raise ValueError(f"Message missing required fields: {required_fields}")

        # Update short-term memory with FIFO policy
        self.short_term_memory.append(message)
        if len(self.short_term_memory) > MAX_SHORT_TERM_MESSAGES:
            self.short_term_memory.pop(0)

        # Update group dynamics metrics
        sender_id = message['sender_id']
        timestamp = datetime.fromisoformat(message['timestamp'])
        
        # Update participation metrics
        if sender_id not in self.group_dynamics['participation_metrics']:
            self.group_dynamics['participation_metrics'][sender_id] = 0
        self.group_dynamics['participation_metrics'][sender_id] += 1

        # Update response times if this is a reply
        if len(self.short_term_memory) > 1:
            prev_message = self.short_term_memory[-2]
            prev_timestamp = datetime.fromisoformat(prev_message['timestamp'])
            response_time = (timestamp - prev_timestamp).total_seconds()
            
            if sender_id not in self.group_dynamics['response_times']:
                self.group_dynamics['response_times'][sender_id] = []
            self.group_dynamics['response_times'][sender_id].append(response_time)

            # Update interaction pairs
            interaction_key = f"{prev_message['sender_id']}-{sender_id}"
            if interaction_key not in self.group_dynamics['interaction_pairs']:
                self.group_dynamics['interaction_pairs'][interaction_key] = 0
            self.group_dynamics['interaction_pairs'][interaction_key] += 1

        self.last_updated = datetime.utcnow()

    def update_embeddings(self, message_id: str, embedding: np.ndarray) -> None:
        """
        Update vector embeddings with dimension validation.
        
        Args:
            message_id (str): Unique identifier for the message
            embedding (np.ndarray): Vector embedding for the message
            
        Raises:
            ValueError: If embedding dimensions don't match EMBEDDING_DIMENSION
        """
        embedding_array = np.asarray(embedding)
        if embedding_array.shape[0] != EMBEDDING_DIMENSION:
            raise ValueError(f"Embedding dimension must be {EMBEDDING_DIMENSION}")
        
        self.embeddings[message_id] = embedding_array
        self.last_updated = datetime.utcnow()

        # Cleanup old embeddings for messages no longer in short-term memory
        current_message_ids = {msg['message_id'] for msg in self.short_term_memory}
        self.embeddings = {
            k: v for k, v in self.embeddings.items() 
            if k in current_message_ids
        }

    def get_recent_context(self, limit: int = MAX_SHORT_TERM_MESSAGES) -> Tuple[List[Dict], Dict[str, np.ndarray]]:
        """
        Retrieve recent context with corresponding embeddings.
        
        Args:
            limit (int): Maximum number of recent messages to retrieve
            
        Returns:
            Tuple[List[Dict], Dict[str, np.ndarray]]: Recent messages and their embeddings
        """
        limit = min(limit, len(self.short_term_memory))
        recent_messages = self.short_term_memory[-limit:]
        
        # Batch fetch corresponding embeddings
        recent_embeddings = {
            msg['message_id']: self.embeddings.get(msg['message_id'])
            for msg in recent_messages
            if msg['message_id'] in self.embeddings
        }
        
        return recent_messages, recent_embeddings

    def is_stale(self) -> bool:
        """
        Check if context has exceeded maximum age threshold.
        
        Returns:
            bool: True if context age exceeds MAX_CONTEXT_AGE_HOURS
        """
        age = datetime.utcnow() - self.last_updated
        return age > timedelta(hours=MAX_CONTEXT_AGE_HOURS)