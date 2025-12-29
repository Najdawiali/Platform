from pydantic import BaseModel
from typing import List

class QueryValidationRequest(BaseModel):
    query: str

class QueryValidationResponse(BaseModel):
    is_valid: bool
    errors: List[str]
