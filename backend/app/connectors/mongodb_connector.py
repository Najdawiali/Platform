# backend/app/connectors/mongodb_connector.py
import pandas as pd
from typing import Dict, Any, Optional, Generator, List
from .base import BaseConnector
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure, ServerSelectionTimeoutError
import json


class MongoDBConnector(BaseConnector):
    """
    Connector for MongoDB databases
    
    Supports:
    - Connection string authentication
    - Database and collection listing
    - Schema inference from documents
    - Data streaming with chunking
    """

    def __init__(
            self,
            connection_string: str,
            database: str,
            collection: Optional[str] = None,
            chunk_size: int = 1000,
            **kwargs
    ):
        """
        Initialize MongoDB connector
        
        Args:
            connection_string: MongoDB connection string (e.g., mongodb://localhost:27017)
            database: Database name
            collection: Collection name (optional, can be set later)
            chunk_size: Number of documents to fetch per chunk
        """
        super().__init__(connection_string, **kwargs)
        
        self.connection_string = connection_string
        self.database_name = database
        self.collection_name = collection
        self.chunk_size = chunk_size
        
        self.client = None
        self.db = None
        self.collection = None
        self.total_documents = 0

    def connect(self) -> bool:
        """Establish connection to MongoDB"""
        try:
            # Create MongoDB client with 5 second timeout
            self.client = MongoClient(
                self.connection_string,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            
            # Test connection by pinging server
            self.client.admin.command('ping')
            
            # Access database
            self.db = self.client[self.database_name]
            
            # Access collection if specified
            if self.collection_name:
                self.collection = self.db[self.collection_name]
                self.total_documents = self.collection.count_documents({})
            
            self.is_connected = True
            return True

        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            print(f"MongoDB connection failed: {e}")
            self.is_connected = False
            return False
        except Exception as e:
            print(f"Error connecting to MongoDB: {e}")
            self.is_connected = False
            return False

    def disconnect(self) -> bool:
        """Close MongoDB connection"""
        try:
            if self.client:
                self.client.close()
                self.client = None
                self.db = None
                self.collection = None
            
            self.is_connected = False
            return True
        except Exception as e:
            print(f"Error disconnecting from MongoDB: {e}")
            return False

    def test_connection(self) -> Dict[str, Any]:
        """Test MongoDB connection without storing it"""
        try:
            client = MongoClient(
                self.connection_string,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            
            # Test connection
            client.admin.command('ping')
            
            # Check if database exists
            db_names = client.list_database_names()
            
            if self.database_name not in db_names:
                client.close()
                return {
                    "success": False,
                    "message": f"Database '{self.database_name}' not found"
                }
            
            # Get database info
            db = client[self.database_name]
            collections = db.list_collection_names()
            
            client.close()
            
            return {
                "success": True,
                "message": f"Successfully connected to MongoDB database '{self.database_name}'",
                "collections": collections,
                "collection_count": len(collections)
            }
            
        except ServerSelectionTimeoutError:
            return {
                "success": False,
                "message": "Connection timeout - please check your connection string and network"
            }
        except ConnectionFailure:
            return {
                "success": False,
                "message": "Failed to connect to MongoDB server"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Connection test failed: {str(e)}"
            }

    def validate_source(self) -> Dict[str, Any]:
        """Validate MongoDB collection exists and is accessible"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        validation_result = {
            "is_valid": True,
            "errors": [],
            "warnings": []
        }

        try:
            if not self.collection_name:
                validation_result["errors"].append("No collection specified")
                validation_result["is_valid"] = False
                return validation_result

            # Check if collection exists
            collections = self.db.list_collection_names()
            if self.collection_name not in collections:
                validation_result["errors"].append(
                    f"Collection '{self.collection_name}' not found in database '{self.database_name}'"
                )
                validation_result["is_valid"] = False
                return validation_result

            # Check if collection has documents
            doc_count = self.collection.count_documents({})
            if doc_count == 0:
                validation_result["warnings"].append("Collection is empty")

            self.total_documents = doc_count

        except OperationFailure as e:
            validation_result["errors"].append(f"Permission denied: {str(e)}")
            validation_result["is_valid"] = False
        except Exception as e:
            validation_result["errors"].append(str(e))
            validation_result["is_valid"] = False

        return validation_result
    
    def get_databases(self) -> List[str]:
        """Get list of all databases on the MongoDB server"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        try:
            db_names = self.client.list_database_names()
            # Filter out system databases
            return [db for db in db_names if db not in ['admin', 'config', 'local']]
        except Exception as e:
            print(f"Error fetching databases: {e}")
            return []
    
    def get_collections(self, database: Optional[str] = None) -> List[str]:
        """Get list of collections in the specified database or current database"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        try:
            db = self.client[database] if database else self.db
            return db.list_collection_names()
        except Exception as e:
            print(f"Error fetching collections: {e}")
            return []
    
    def get_databases_with_tables(self) -> Dict[str, List[str]]:
        """Get all databases with their collections"""
        if not self.is_connected:
            raise RuntimeError("Not connected. Call connect() first.")

        try:
            databases = self.get_databases()
            result = {}
            
            for db_name in databases:
                collections = self.get_collections(database=db_name)
                result[db_name] = collections
            
            return result
        except Exception as e:
            print(f"Error fetching databases with collections: {e}")
            return {}

    def get_schema(self) -> Dict[str, Any]:
        """
        Infer schema from MongoDB collection by sampling documents
        MongoDB is schema-less, so we sample documents to infer structure
        """
        if not self.is_connected or self.collection is None:
            raise RuntimeError("Not connected to a collection. Call connect() first.")

        try:
            # Sample documents to infer schema (max 1000)
            sample_size = min(1000, self.total_documents)
            sample_docs = list(self.collection.find().limit(sample_size))

            if not sample_docs:
                return {
                    "columns": [],
                    "row_count": 0,
                    "column_count": 0
                }

            # Convert to DataFrame to infer types
            df = pd.DataFrame(sample_docs)
            
            # Remove MongoDB's _id field for schema (we'll keep it in data)
            if '_id' in df.columns:
                df['_id'] = df['_id'].astype(str)

            columns = []
            for col in df.columns:
                # Infer type
                dtype = str(df[col].dtype)
                
                # Map pandas dtypes to standard types
                if dtype.startswith('int'):
                    col_type = 'integer'
                elif dtype.startswith('float'):
                    col_type = 'float'
                elif dtype == 'bool':
                    col_type = 'boolean'
                elif dtype == 'datetime64':
                    col_type = 'datetime'
                else:
                    col_type = 'string'

                # Handle unique count safely (lists/dicts are unhashable)
                try:
                    unique_count = int(df[col].nunique())
                except TypeError:
                    # Column contains unhashable types (lists, dicts)
                    # Convert to string for counting
                    unique_count = int(df[col].astype(str).nunique())

                columns.append({
                    "name": col,
                    "type": col_type,
                    "nullable": bool(df[col].isnull().any()),
                    "unique_count": unique_count,
                    "null_count": int(df[col].isnull().sum())
                })

            return {
                "columns": columns,
                "row_count": self.total_documents,
                "column_count": len(columns),
                "sample_size": sample_size
            }

        except Exception as e:
            raise RuntimeError(f"Failed to get schema: {str(e)}")

    def get_preview_data(self, limit: int = 100) -> pd.DataFrame:
        """Get preview of collection data"""
        if not self.is_connected or self.collection is None:
            raise RuntimeError("Not connected to a collection. Call connect() first.")

        try:
            # Fetch limited documents
            docs = list(self.collection.find().limit(limit))
            
            if not docs:
                return pd.DataFrame()

            # Convert to DataFrame
            df = pd.DataFrame(docs)
            
            # Convert _id to string
            if '_id' in df.columns:
                df['_id'] = df['_id'].astype(str)

            return df

        except Exception as e:
            raise RuntimeError(f"Failed to get preview data: {str(e)}")

    def read_data(self, **kwargs) -> Generator[pd.DataFrame, None, None]:
        """
        Stream data from MongoDB collection in chunks
        
        Yields:
            pd.DataFrame chunks
        """
        if not self.is_connected or self.collection is None:
            raise RuntimeError("Not connected to a collection. Call connect() first.")

        try:
            # Get query filter if provided
            query_filter = kwargs.get('filter', {})
            
            # Stream documents in chunks
            skip = 0
            while True:
                docs = list(
                    self.collection.find(query_filter)
                    .skip(skip)
                    .limit(self.chunk_size)
                )

                if not docs:
                    break

                # Convert to DataFrame
                df = pd.DataFrame(docs)
                
                # Convert _id to string
                if '_id' in df.columns:
                    df['_id'] = df['_id'].astype(str)

                yield df

                skip += self.chunk_size

                # Break if we got less than chunk_size (last chunk)
                if len(docs) < self.chunk_size:
                    break

        except Exception as e:
            raise RuntimeError(f"Failed to read data: {str(e)}")

    def set_collection(self, collection_name: str) -> bool:
        """Set the active collection"""
        if not self.is_connected or self.db is None:
            raise RuntimeError("Not connected. Call connect() first.")

        try:
            self.collection_name = collection_name
            self.collection = self.db[collection_name]
            self.total_documents = self.collection.count_documents({})
            return True
        except Exception as e:
            print(f"Failed to set collection: {e}")
            return False

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """
        Fetch data from MongoDB collection with pagination
        
        Args:
            limit: Maximum number of documents to fetch
            offset: Number of documents to skip
            
        Returns:
            DataFrame with requested data
        """
        if not self.is_connected or self.collection is None:
            raise RuntimeError("Not connected to a collection. Call connect() first.")

        try:
            query = self.collection.find().skip(offset)
            
            if limit:
                query = query.limit(limit)
            
            docs = list(query)
            
            if not docs:
                return pd.DataFrame()

            # Convert to DataFrame
            df = pd.DataFrame(docs)
            
            # Convert _id to string
            if '_id' in df.columns:
                df['_id'] = df['_id'].astype(str)

            return df

        except Exception as e:
            raise RuntimeError(f"Failed to fetch data: {str(e)}")

    def fetch_data_chunked(self, chunk_size: int = 10000) -> Generator[pd.DataFrame, None, None]:
        """
        Fetch data in chunks as a generator (same as read_data)
        
        Args:
            chunk_size: Number of documents per chunk
            
        Yields:
            DataFrame chunks
        """
        # Delegate to read_data which already implements chunking
        yield from self.read_data()

    def get_row_count(self) -> int:
        """
        Get total number of documents in the collection
        
        Returns:
            Total document count
        """
        if not self.is_connected or self.collection is None:
            raise RuntimeError("Not connected to a collection. Call connect() first.")

        try:
            return self.collection.count_documents({})
        except Exception as e:
            raise RuntimeError(f"Failed to get row count: {str(e)}")
