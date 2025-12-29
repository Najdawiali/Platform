from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union

class QuerySource(BaseModel):
    alias: str
    type: str  # "dataset" or "connection"
    id: str
    # For connections, we need to know which table/collection to fetch
    source_identifier: Optional[str] = None 

class QueryRequest(BaseModel):
    query: str
    sources: List[QuerySource]
    page: Optional[int] = 1
    page_size: Optional[int] = 100

class QueryResult(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    execution_time_ms: float
    error: Optional[str] = None
    page: Optional[int] = None
    page_size: Optional[int] = None
    total_pages: Optional[int] = None
