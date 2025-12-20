# backend/app/connectors/base.py
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Generator
import pandas as pd


class BaseConnector(ABC):
    """Abstract base class for all data source connectors"""

    def __init__(self, connection_string: str, **kwargs):
        """
        Initialize connector
        Args:
            connection_string: File path, connection URL, etc.
            **kwargs: Additional connector-specific parameters
        """
        self.connection_string = connection_string
        self.is_connected = False
        self.config = kwargs

    @abstractmethod
    def connect(self) -> bool:
        """
        Establish connection to the data source
        Returns:
            bool: True if connection successful
        """
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        """
        Close connection to the data source
        Returns:
            bool: True if disconnection successful
        """
        pass

    @abstractmethod
    def validate_source(self) -> Dict[str, Any]:
        """
        Validate the data source structure and accessibility
        Returns:
            Dict with validation results including errors and warnings
        """
        pass

    @abstractmethod
    def get_schema(self) -> Dict[str, Any]:
        """
        Get schema/structure of the data source
        Returns:
            Dict containing schema information (columns, types, stats)
        """
        pass

    @abstractmethod
    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """
        Fetch data from the source with pagination
        Args:
            limit: Maximum number of rows to fetch
            offset: Number of rows to skip
        Returns:
            DataFrame with requested data
        """
        pass

    @abstractmethod
    def fetch_data_chunked(self, chunk_size: int = 10000) -> Generator[pd.DataFrame, None, None]:
        """
        Fetch data in chunks as a generator
        Args:
            chunk_size: Number of rows per chunk
        Yields:
            DataFrame chunks
        """
        pass

    @abstractmethod
    def get_row_count(self) -> int:
        """
        Get total number of rows in the data source
        Returns:
            Total row count
        """
        pass

    def test_connection(self) -> Dict[str, Any]:
        """
        Test connection to data source
        Returns:
            Dict with connection test results
        """
        try:
            success = self.connect()
            if success:
                self.disconnect()
                return {
                    "success": True,
                    "message": "Connection successful"
                }
            else:
                return {
                    "success": False,
                    "message": "Connection failed"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Connection error: {str(e)}"
            }