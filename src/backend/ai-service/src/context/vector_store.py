from typing import Dict, List, Optional
import numpy as np  # v1.24+
import logging  # v3.11+
from pymilvus import (  # v2.2+
    connections, 
    Collection,
    CollectionSchema,
    FieldSchema,
    DataType,
    utility,
    MilvusException
)
from tenacity import (  # v8.0+
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from config.settings import Settings
from models.context import Context

# Constants for Milvus configuration
COLLECTION_NAME = "message_embeddings"
INDEX_TYPE = "IVF_FLAT"
METRIC_TYPE = "IP"  # Inner Product similarity
NLIST = 1024  # Number of cluster units
NPROBE = 16  # Number of units to query
MAX_RETRIES = 3
RETRY_DELAY = 1.0
BATCH_SIZE = 1000
CONNECTION_TIMEOUT = 30.0

class VectorStore:
    """
    Manages vector database operations for storing and retrieving message embeddings
    with enhanced error handling, connection pooling, and performance optimization.
    """

    def __init__(self, pool_size: int = 10, timeout: float = CONNECTION_TIMEOUT):
        """
        Initialize vector store with connection settings and monitoring.

        Args:
            pool_size (int): Size of the connection pool
            timeout (float): Connection timeout in seconds
        """
        self._connected = False
        self._collection: Optional[Collection] = None
        self._logger = logging.getLogger(__name__)
        self._logger.setLevel(logging.INFO)
        
        # Performance metrics tracking
        self._performance_metrics = {
            'inserts': 0,
            'searches': 0,
            'avg_search_time': 0.0,
            'avg_insert_time': 0.0
        }

        # Get configuration from settings
        settings = Settings()
        self.host = settings.milvus_host
        self.port = settings.milvus_port

        # Initialize connection with retry logic
        self._connect_with_retry()

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY),
        retry=retry_if_exception_type(MilvusException)
    )
    def _connect_with_retry(self) -> None:
        """Establish connection to Milvus with retry logic."""
        try:
            # Connect to Milvus server
            connections.connect(
                alias="default",
                host=self.host,
                port=self.port,
                timeout=CONNECTION_TIMEOUT
            )

            # Define collection schema
            fields = [
                FieldSchema(name="message_id", dtype=DataType.VARCHAR, max_length=64, is_primary=True),
                FieldSchema(name="chat_id", dtype=DataType.VARCHAR, max_length=64),
                FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=Context.EMBEDDING_DIMENSION)
            ]
            schema = CollectionSchema(fields=fields, description="Message embeddings collection")

            # Create or get collection
            if not utility.has_collection(COLLECTION_NAME):
                self._collection = Collection(name=COLLECTION_NAME, schema=schema)
                
                # Create index
                index_params = {
                    "index_type": INDEX_TYPE,
                    "metric_type": METRIC_TYPE,
                    "params": {"nlist": NLIST}
                }
                self._collection.create_index(
                    field_name="embedding",
                    index_params=index_params
                )
            else:
                self._collection = Collection(name=COLLECTION_NAME)

            # Load collection into memory
            self._collection.load()
            self._connected = True
            self._logger.info("Successfully connected to Milvus vector store")

        except MilvusException as e:
            self._logger.error(f"Failed to connect to Milvus: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY),
        retry=retry_if_exception_type(MilvusException)
    )
    def store_embedding(self, message_id: str, chat_id: str, embedding: np.ndarray, batch_mode: bool = False) -> bool:
        """
        Store message embedding in vector database.

        Args:
            message_id (str): Unique identifier for the message
            chat_id (str): Chat/conversation identifier
            embedding (np.ndarray): Vector embedding
            batch_mode (bool): Whether to use batch insertion

        Returns:
            bool: Success status
        """
        if not self._connected or self._collection is None:
            raise RuntimeError("Not connected to vector store")

        try:
            # Validate embedding dimensions
            if embedding.shape[0] != Context.EMBEDDING_DIMENSION:
                raise ValueError(f"Embedding dimension must be {Context.EMBEDDING_DIMENSION}")

            # Prepare entity for insertion
            entity = [
                [message_id],  # message_id
                [chat_id],     # chat_id
                [embedding.tolist()]  # embedding
            ]

            # Insert with batch support
            self._collection.insert(entity)
            
            # Flush if not in batch mode
            if not batch_mode:
                self._collection.flush()

            self._performance_metrics['inserts'] += 1
            self._logger.debug(f"Successfully stored embedding for message {message_id}")
            return True

        except Exception as e:
            self._logger.error(f"Failed to store embedding: {str(e)}")
            return False

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY),
        retry=retry_if_exception_type(MilvusException)
    )
    def search_similar(
        self,
        query_embedding: np.ndarray,
        chat_id: str,
        limit: int = 5,
        score_threshold: float = 0.7
    ) -> List[Dict]:
        """
        Search for similar message embeddings.

        Args:
            query_embedding (np.ndarray): Query vector
            chat_id (str): Chat/conversation identifier
            limit (int): Maximum number of results
            score_threshold (float): Minimum similarity score

        Returns:
            List[Dict]: Similar messages with scores
        """
        if not self._connected or self._collection is None:
            raise RuntimeError("Not connected to vector store")

        try:
            # Validate query embedding
            if query_embedding.shape[0] != Context.EMBEDDING_DIMENSION:
                raise ValueError(f"Query embedding dimension must be {Context.EMBEDDING_DIMENSION}")

            # Prepare search parameters
            search_params = {
                "metric_type": METRIC_TYPE,
                "params": {"nprobe": NPROBE}
            }

            # Execute search with chat_id filter
            results = self._collection.search(
                data=[query_embedding.tolist()],
                anns_field="embedding",
                param=search_params,
                limit=limit,
                expr=f'chat_id == "{chat_id}"',
                output_fields=["message_id", "chat_id"]
            )

            # Format and filter results
            similar_messages = []
            for hits in results:
                for hit in hits:
                    if hit.score >= score_threshold:
                        similar_messages.append({
                            "message_id": hit.entity.get("message_id"),
                            "chat_id": hit.entity.get("chat_id"),
                            "score": float(hit.score)
                        })

            self._performance_metrics['searches'] += 1
            self._logger.debug(f"Successfully executed similarity search with {len(similar_messages)} results")
            return similar_messages

        except Exception as e:
            self._logger.error(f"Failed to execute similarity search: {str(e)}")
            return []