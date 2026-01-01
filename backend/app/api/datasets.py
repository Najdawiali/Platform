# backend/app/api/datasets.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import pyarrow.parquet as pq
import io
import csv

from ..database import get_db
from ..models.user import User
from ..models.connection import Connection, SourceType  # Added SourceType import
from ..schemas.dataset import (
    DatasetResponse,
    DatasetDetail,
    DatasetPreview,
    DatasetFullData,
    DatasetQuery,
    DatasetQueryResult
)
from ..services.dataset_service import DatasetService
from ..services.connection_service import ConnectionService
from .auth import get_current_user
from ..utils.security import decode_access_token

router = APIRouter()


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_dataset(
        connection_id: str = Form(...),
        file: UploadFile = File(...),
        name: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Upload a file (CSV or Excel) and create dataset(s)
    For Excel files with multiple sheets, creates one dataset per sheet

    FILE-BASED SOURCES: CSV, Excel
    """

    # Get connection
    connection = ConnectionService.get_connection_by_id(connection_id, current_user, db)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )

    # Validate connection type is file-based
    if connection.source_type not in [SourceType.CSV, SourceType.EXCEL, SourceType.JSON, SourceType.TXT, SourceType.MD, SourceType.MDX, SourceType.PDF]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection type '{connection.source_type}' is not a file-based source. Use /from-database endpoint instead."
        )

    # Validate file type matches connection type
    file_ext = file.filename.lower().split('.')[-1]

    if connection.source_type == SourceType.CSV and file_ext != 'csv':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects CSV file, but got .{file_ext}"
        )

    if connection.source_type == SourceType.EXCEL and file_ext not in ['xlsx', 'xls']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects Excel file, but got .{file_ext}"
        )

    if connection.source_type == SourceType.JSON and file_ext != 'json':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects JSON file, but got .{file_ext}"
        )

    if connection.source_type == SourceType.TXT and file_ext != 'txt':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects TXT file, but got .{file_ext}"
        )

    if connection.source_type == SourceType.MD and file_ext != 'md':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects Markdown file, but got .{file_ext}"
        )

    if connection.source_type == SourceType.MDX and file_ext != 'mdx':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects MDX file, but got .{file_ext}"
        )

    if connection.source_type == SourceType.PDF and file_ext != 'pdf':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection expects PDF file, but got .{file_ext}"
        )

    # Validate file size (500MB limit)
    MAX_FILE_SIZE = 500 * 1024 * 1024
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum limit of 500MB"
        )

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty"
        )

    try:
        # UNIFIED WORKFLOW - handles both CSV and Excel
        results = DatasetService.create_datasets_from_file(
            file=file,
            user=current_user,
            connection=connection,
            name=name,
            description=description,
            db=db
        )

        return {
            "success": True,
            "datasets_created": len(results),
            "results": results
        }

    except FileExistsError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process file: {str(e)}"
        )


@router.post("/from-database", status_code=status.HTTP_201_CREATED)
async def create_dataset_from_database(
        connection_id: str = Form(...),
        source_identifier: str = Form(...),  # table/collection name
        name: str = Form(...),
        description: Optional[str] = Form(None),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Create dataset from database source (Snowflake, SQL Server, MongoDB, etc.)

    DATABASE SOURCES: Snowflake, SQL Server, MongoDB, PostgreSQL, MySQL

    source_identifier examples:
    - Snowflake: "SCHEMA.TABLE"
    - SQL Server: "dbo.customers"
    - MongoDB: "users"
    """

    # Get connection
    connection = ConnectionService.get_connection_by_id(connection_id, current_user, db)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )

    # Validate connection type is database-based
    database_sources = [
        SourceType.SNOWFLAKE,
        SourceType.SQLSERVER,
        SourceType.MONGODB,
        SourceType.POSTGRESQL,
        SourceType.MYSQL
    ]

    if connection.source_type not in database_sources:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection type '{connection.source_type}' is not a database source. Use /upload endpoint instead."
        )

    try:
        # UNIFIED WORKFLOW - same pipeline as CSV/Excel
        result = DatasetService.create_dataset_from_database(
            connection=connection,
            source_identifier=source_identifier,
            name=name,
            description=description,
            user=current_user,
            db=db
        )

        return {
            "success": True,
            "datasets_created": 1,
            "results": [result]
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create dataset: {str(e)}"
        )


@router.get("/", response_model=List[DatasetResponse])
def list_datasets(
        connection_id: Optional[str] = None,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get all datasets for the current user
    Optionally filter by connection_id
    """
    datasets = DatasetService.get_user_datasets(current_user, db)

    if connection_id:
        datasets = [d for d in datasets if d.connection_id == connection_id]

    return datasets


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(
        dataset_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get details of a specific dataset including schema and quality info
    """
    dataset = DatasetService.get_dataset_by_id(dataset_id, current_user, db)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return dataset


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
def preview_dataset(
        dataset_id: str,
        limit: int = 100,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get a preview of the dataset (first N rows)
    """
    dataset = DatasetService.get_dataset_by_id(dataset_id, current_user, db)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    try:
        preview = DatasetService.get_dataset_preview(dataset, limit=limit)
        return preview
    except Exception as e:
        import traceback
        print(f"[ERROR] Failed to preview dataset {dataset_id}:")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview dataset: {str(e)}"
        )


@router.get("/{dataset_id}/full-data", response_model=DatasetFullData)
def get_full_dataset_data(
        dataset_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get full dataset data for visualization (up to 100k rows)
    """
    dataset = DatasetService.get_dataset_by_id(dataset_id, current_user, db)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    try:
        full_data = DatasetService.get_full_dataset_data(dataset)
        return full_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dataset data: {str(e)}"
        )


@router.get("/{dataset_id}/quality-report")
def get_quality_report(
        dataset_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Get quality report for a dataset
    """
    dataset = DatasetService.get_dataset_by_id(dataset_id, current_user, db)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    quality_report = DatasetService.get_quality_report(dataset)

    if not quality_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quality report not available for this dataset"
        )

    return quality_report


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
        dataset_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Delete a dataset
    """
    success = DatasetService.delete_dataset(dataset_id, current_user, db)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return None


@router.post("/{dataset_id}/query", response_model=DatasetQueryResult)
def query_dataset(
        dataset_id: str,
        query_request: DatasetQuery,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """
    Execute a SQL query against a dataset
    """
    dataset = DatasetService.get_dataset_by_id(dataset_id, current_user, db)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    try:
        result = DatasetService.execute_sql_query(dataset, query_request.query)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/{dataset_id}/export")
def export_dataset(
        dataset_id: str,
        token: Optional[str] = Query(None),
        filename: Optional[str] = Query(None),
        db: Session = Depends(get_db)
):
    """
    Export full dataset as CSV (streaming for memory efficiency)
    Token can be passed as query parameter for download links
    """
    import os
    
    # Authenticate using token from query parameter
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required for export"
        )
    
    # Decode and verify token
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    # Get user from token
    email = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    current_user = db.query(User).filter(User.email == email).first()
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    dataset = DatasetService.get_dataset_by_id(dataset_id, current_user, db)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    # Get parquet file path (check both file_path and schema_info)
    filepath = dataset.file_path
    
    # For SQL query datasets, the parquet path is in schema_info
    if not filepath and dataset.schema_info:
        filepath = dataset.schema_info.get("parquet_path")
    
    if not filepath:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset has no parquet file"
        )
    
    # Check if file exists
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parquet file not found at {filepath}"
        )

    def stream_csv():
        """Generator function that streams CSV data in chunks"""
        try:
            # Open parquet file (doesn't load into memory)
            parquet_file = pq.ParquetFile(filepath)
            
            # Get column names from schema
            columns = parquet_file.schema.names
            
            # Create CSV writer to string buffer
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow(columns)
            yield output.getvalue()
            output.truncate(0)
            output.seek(0)
            
            # Stream data in batches
            for batch in parquet_file.iter_batches(batch_size=1000):
                # Convert batch to pandas for easy CSV conversion
                df = batch.to_pandas()
                
                # Write rows to CSV
                for _, row in df.iterrows():
                    writer.writerow(row.values)
                
                # Yield the accumulated CSV text
                yield output.getvalue()
                
                # Clear buffer for next batch
                output.truncate(0)
                output.seek(0)
                
        except Exception as e:
            # If error occurs during streaming, log it
            import traceback
            print(f"Error during CSV export: {str(e)}")
            print(traceback.format_exc())
            raise

    # Generate filename from provided name or dataset name
    if filename:
        safe_name = "".join(c for c in filename if c.isalnum() or c in (' ', '_', '-')).strip()
    else:
        safe_name = "".join(c for c in dataset.name if c.isalnum() or c in (' ', '_', '-')).strip()
    csv_filename = f"{safe_name or 'dataset'}.csv"

    return StreamingResponse(
        stream_csv(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={csv_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
