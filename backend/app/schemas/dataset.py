# backend/app/schemas/dataset.py
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class DatasetBase(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetCreate(DatasetBase):
    pass


class DatasetResponse(DatasetBase):
    id: str
    user_id: str
    original_filename: Optional[str]
    file_size: Optional[int]
    row_count: Optional[int]
    column_count: Optional[int]
    status: str
    error_message: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DatasetDetail(DatasetResponse):
    schema_info: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True


class DatasetPreview(BaseModel):
    """Preview data from a dataset"""
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_rows: int
    preview_rows: int


class ValidationResult(BaseModel):
    """Validation result for uploaded file"""
    is_valid: bool
    errors: List[str]
    warnings: List[str]


class QualityIssues(BaseModel):
    """Quality issues categorized by severity"""
    critical: List[str]
    warning: List[str]
    info: List[str]


class QualitySummary(BaseModel):
    """Summary of quality check results"""
    total_cells: int
    missing_cells: int
    completeness_percentage: float
    critical_issues: int
    warnings: int
    info_items: int


class ColumnQuality(BaseModel):
    """Quality metrics for a single column"""
    name: str
    data_type: str
    null_count: int
    null_percentage: float
    unique_count: int
    duplicate_count: int
    duplicate_percentage: float
    completeness_score: float
    # Optional numeric fields
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    outlier_count: Optional[int] = None
    # Optional string fields
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    avg_length: Optional[float] = None
    empty_string_count: Optional[int] = None


class QualityReport(BaseModel):
    """Comprehensive quality report"""
    overall_score: float
    checks_performed: str
    row_count: int
    column_count: int
    columns: List[Dict[str, Any]]
    issues: QualityIssues
    summary: QualitySummary


class DatasetUploadResponse(BaseModel):
    """Response after uploading a dataset"""
    dataset: DatasetResponse
    validation: ValidationResult
    quality_report: Optional[QualityReport]


class DatasetFullData(BaseModel):
    """Full dataset data for visualization"""
    columns: List[str]
    data: List[Dict[str, Any]]
    total_rows: int
    returned_rows: int
    is_partial: bool