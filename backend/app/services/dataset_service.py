# backend/app/services/dataset_service.py
import os
import shutil
from typing import Optional, List, Dict, Any
from fastapi import UploadFile
from sqlalchemy.orm import Session

from ..models.dataset import Dataset
from ..models.connection import Connection, SourceType
from ..models.user import User
from ..connectors.csv_connector import CSVConnector
from ..connectors.excel_connector import ExcelConnector
from ..connectors.json_connector import JSONConnector
from ..connectors.txt_connector import TXTConnector
from ..connectors.markdown_connector import MarkdownConnector
from ..connectors.mdx_connector import MDXConnector
from ..connectors.pdf_connector import PDFConnector
from .quality_service import QualityService
from .preprocessing_service import DataPreprocessingService

UPLOAD_DIR = "./uploads"


class DatasetService:
    """Service for handling dataset operations across multiple source types"""

    @staticmethod
    def create_dataset_from_database(
            connection: Connection,
            source_identifier: str,  # e.g., "database.schema.table" or "collection_name"
            name: str,
            description: Optional[str],
            user: User,
            db: Session
    ) -> Dict[str, Any]:
        """
        Create dataset from database source (Snowflake, SQL Server, MongoDB, etc.)
        Uses the SAME UNIFIED PIPELINE as file sources

        Args:
            connection: Database connection with credentials
            source_identifier: Table name, collection name, etc.
            name: Dataset name
            description: Optional description
            user: Current user
            db: Database session

        Returns:
            Same structure as file upload - dataset, validation, quality_report
        """

        # Route to appropriate connector based on connection type
        if connection.source_type == SourceType.SNOWFLAKE:
            from ..connectors.snowflake_connector import SnowflakeConnector
            connector_class = SnowflakeConnector
            connector_kwargs = {
                'account': connection.credentials.get('account'),
                'username': connection.credentials.get('username'),
                'password': connection.credentials.get('password'),
                'warehouse': connection.credentials.get('warehouse'),
                'database': connection.credentials.get('database'),
                'schema': connection.credentials.get('schema_name'),
                'table': source_identifier
            }

        elif connection.source_type == SourceType.SQLSERVER:
            from ..connectors.sqlserver_connector import SQLServerConnector
            connector_class = SQLServerConnector
            connector_kwargs = {
                'host': connection.credentials.get('host'),
                'port': connection.credentials.get('port'),
                'database': connection.credentials.get('database'),
                'username': connection.credentials.get('username'),
                'password': connection.credentials.get('password'),
                'table': source_identifier
            }

        elif connection.source_type == SourceType.MONGODB:
            from ..connectors.mongodb_connector import MongoDBConnector
            connector_class = MongoDBConnector
            connector_kwargs = {
                'connection_string': connection.credentials.get('connection_string'),
                'database': connection.credentials.get('database'),
                'collection': source_identifier
            }

        elif connection.source_type == SourceType.POSTGRESQL:
            from ..connectors.postgresql_connector import PostgreSQLConnector
            connector_class = PostgreSQLConnector
            connector_kwargs = {
                'host': connection.credentials.get('host'),
                'port': connection.credentials.get('port'),
                'database': connection.credentials.get('database'),
                'username': connection.credentials.get('username'),
                'password': connection.credentials.get('password'),
                'table': source_identifier
            }

        else:
            raise ValueError(f"Unsupported database source type: {connection.source_type}")

        # Use UNIFIED PIPELINE - same as CSV/Excel
        result = DatasetService._process_single_source(
            connector_class=connector_class,
            connector_kwargs=connector_kwargs,
            file_path=None,  # No file path for database sources
            file_size=None,
            base_name=name,
            description=description,
            user=user,
            connection=connection,
            source_type=connection.source_type.value,
            db=db,
            source_identifier=source_identifier  # Store collection/table name
        )

        return result

    @staticmethod
    def create_datasets_from_file(
            file: UploadFile,
            user: User,
            connection: Connection,
            name: Optional[str],
            description: Optional[str],
            db: Session
    ) -> List[Dict[str, Any]]:
        """
        Upload and process file (CSV or Excel)
        For Excel with multiple sheets, creates one dataset per sheet
        Returns list of dataset results

        UNIFIED WORKFLOW - only connector changes based on source type
        """

        # Use filename as base name if not provided
        base_name = name or os.path.splitext(file.filename)[0]

        # Create user's upload directory
        user_upload_dir = os.path.join(UPLOAD_DIR, user.id)
        os.makedirs(user_upload_dir, exist_ok=True)

        # Save file
        file_path = os.path.join(user_upload_dir, file.filename)

        try:
            # Save uploaded file
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            file_size = os.path.getsize(file_path)

            # Determine source type from connection or file extension
            source_type = connection.source_type

            # For file-based connections, verify file type matches
            if source_type == SourceType.CSV:
                if not file.filename.lower().endswith('.csv'):
                    raise ValueError(f"Expected CSV file, got: {file.filename}")

            elif source_type == SourceType.EXCEL:
                if not file.filename.lower().endswith(('.xlsx', '.xls')):
                    raise ValueError(f"Expected Excel file, got: {file.filename}")

            elif source_type == SourceType.JSON:
                if not file.filename.lower().endswith('.json'):
                    raise ValueError(f"Expected JSON file, got: {file.filename}")

            elif source_type == SourceType.TXT:
                if not file.filename.lower().endswith('.txt'):
                    raise ValueError(f"Expected TXT file, got: {file.filename}")

            elif source_type == SourceType.MD:
                if not file.filename.lower().endswith('.md'):
                    raise ValueError(f"Expected Markdown file, got: {file.filename}")

            elif source_type == SourceType.MDX:
                if not file.filename.lower().endswith('.mdx'):
                    raise ValueError(f"Expected MDX file, got: {file.filename}")

            elif source_type == SourceType.PDF:
                if not file.filename.lower().endswith('.pdf'):
                    raise ValueError(f"Expected PDF file, got: {file.filename}")

            # Route to appropriate processor based on source type
            if source_type == SourceType.CSV:
                result = DatasetService._process_single_source(
                    connector_class=CSVConnector,
                    connector_kwargs={'file_path': file_path, 'chunk_size': 10000},
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    source_type="csv",
                    db=db
                )
                return [result]

            elif source_type == SourceType.JSON:
                result = DatasetService._process_single_source(
                    connector_class=JSONConnector,
                    connector_kwargs={'file_path': file_path, 'chunk_size': 10000},
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    source_type="json",
                    db=db
                )
                return [result]

            elif source_type == SourceType.TXT:
                result = DatasetService._process_single_source(
                    connector_class=TXTConnector,
                    connector_kwargs={'file_path': file_path, 'chunk_size': 10000},
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    source_type="txt",
                    db=db
                )
                return [result]

            elif source_type == SourceType.MD:
                result = DatasetService._process_single_source(
                    connector_class=MarkdownConnector,
                    connector_kwargs={'file_path': file_path, 'chunk_size': 10000},
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    source_type="md",
                    db=db
                )
                return [result]

            elif source_type == SourceType.MDX:
                result = DatasetService._process_single_source(
                    connector_class=MDXConnector,
                    connector_kwargs={'file_path': file_path, 'chunk_size': 10000},
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    source_type="mdx",
                    db=db
                )
                return [result]

            elif source_type == SourceType.PDF:
                result = DatasetService._process_single_source(
                    connector_class=PDFConnector,
                    connector_kwargs={'file_path': file_path, 'chunk_size': 10000},
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    source_type="pdf",
                    db=db
                )
                return [result]

            elif source_type == SourceType.EXCEL:
                results = DatasetService._process_excel_multi_sheet(
                    file_path=file_path,
                    file_size=file_size,
                    base_name=base_name,
                    description=description,
                    user=user,
                    connection=connection,
                    db=db
                )
                return results

            else:
                raise ValueError(f"Unsupported source type for file upload: {source_type}")

        except Exception as e:
            # Clean up file if something went wrong
            if os.path.exists(file_path):
                os.remove(file_path)
            raise e

    @staticmethod
    def _process_single_source(
            connector_class,
            connector_kwargs: Dict[str, Any],
            file_path: str,
            file_size: int,
            base_name: str,
            description: Optional[str],
            user: User,
            connection: Connection,
            source_type: str,
            db: Session,
            sheet_name: Optional[str] = None,
            source_identifier: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        UNIFIED PROCESSING PIPELINE for ANY data source
        Works for: CSV, Excel, Snowflake, SQL Server, MongoDB, etc.

        Only the connector changes - workflow is identical
        """

        # Create dataset record
        dataset = Dataset(
            user_id=user.id,
            connection_id=connection.id,
            name=base_name,
            description=description,
            source_type=source_type,
            source_identifier=source_identifier or file_path,
            sheet_name=sheet_name,
            original_filename=os.path.basename(file_path) if file_path else None,
            file_path=file_path if file_path else None,
            file_size=file_size if file_size else None,
            status="processing"
        )

        db.add(dataset)
        db.commit()
        db.refresh(dataset)

        try:
            # Step 1: Initialize connector (universal for all sources)
            connector = connector_class(**connector_kwargs)

            # Step 2: Connect (universal)
            if not connector.connect():
                # Delete the dataset record if connection fails
                db.delete(dataset)
                db.commit()
                raise Exception(f"Failed to connect to {source_type} data source")

            # Step 3: Validate structure (universal)
            validation_result = connector.validate_source()

            if not validation_result["is_valid"]:
                # Delete the dataset record if validation fails
                db.delete(dataset)
                db.commit()
                connector.disconnect()
                raise Exception(f"Validation failed: {', '.join(validation_result['errors'])}")

            # Step 4: Get schema (universal)
            schema = connector.get_schema()

            # Step 5: UNIFIED QUALITY CHECKS with PREPROCESSING
            quality_reports = []
            preprocessing_reports = []
            chunk_count = 0

            for chunk in connector.fetch_data_chunked():
                chunk_count += 1

                # CRITICAL: Preprocess data before quality checks
                # This handles ALL edge cases: mixed types, special chars,
                # bad values, encoding issues, etc.
                preprocessed_chunk, prep_report = DataPreprocessingService.preprocess_dataframe(chunk)
                preprocessing_reports.append(prep_report)

                # Now run quality checks on CLEAN data
                quality_report = QualityService.perform_quality_checks(
                    preprocessed_chunk,
                    is_first_chunk=(chunk_count == 1)
                )
                quality_reports.append(quality_report)

                # Limit quality checks to first 50k rows for all sources
                if chunk_count >= 5:
                    break

            # Step 6: Aggregate quality reports (universal)
            aggregated_quality = QualityService.aggregate_chunk_reports(quality_reports) if quality_reports else None

            # Step 6b: Aggregate preprocessing reports
            preprocessing_summary = None
            if preprocessing_reports:
                # Combine all preprocessing reports
                combined_prep = {
                    "chunks_processed": len(preprocessing_reports),
                    "total_transformations": sum(len(r["transformations_applied"]) for r in preprocessing_reports),
                    "total_issues_fixed": sum(len(r["issues_fixed"]) for r in preprocessing_reports),
                    "data_types_inferred": preprocessing_reports[0][
                        "data_types_inferred"] if preprocessing_reports else {},
                    "sample_issues": preprocessing_reports[0]["issues_fixed"][:10] if preprocessing_reports and
                                                                                      preprocessing_reports[0][
                                                                                          "issues_fixed"] else []
                }
                preprocessing_summary = combined_prep

            # Step 7: Update dataset with results (universal)
            dataset.row_count = schema["row_count"]
            dataset.column_count = schema["column_count"]
            dataset.schema_info = {
                "schema": schema,
                "validation": validation_result,
                "quality_report": aggregated_quality,
                "preprocessing_summary": preprocessing_summary  # Add preprocessing info
            }
            dataset.status = "ready"

            connector.disconnect()

        except Exception as e:
            # Delete the dataset record on any error
            db.delete(dataset)
            db.commit()
            raise e

        db.commit()
        db.refresh(dataset)

        return {
            "dataset": dataset,
            "validation": validation_result,
            "quality_report": aggregated_quality
        }

    @staticmethod
    def _process_excel_multi_sheet(
            file_path: str,
            file_size: int,
            base_name: str,
            description: Optional[str],
            user: User,
            connection: Connection,
            db: Session
    ) -> List[Dict[str, Any]]:
        """
        Process Excel file - creates one dataset per sheet
        Uses the UNIFIED pipeline for each sheet
        """

        # First, detect all sheets
        connector = ExcelConnector(file_path)

        if not connector.connect():
            raise Exception("Failed to read Excel file")

        sheets_info = connector.get_sheet_info()
        connector.disconnect()

        results = []

        # Process each sheet using the UNIFIED pipeline
        for sheet_info in sheets_info:
            sheet_name = sheet_info["sheet_name"]

            # Skip sheets with errors
            if "error" in sheet_info:
                continue

            # Dataset name: base_name + sheet_name if multiple sheets
            dataset_name = f"{base_name}_{sheet_name}" if len(sheets_info) > 1 else base_name

            # Use UNIFIED pipeline with Excel connector for this specific sheet
            result = DatasetService._process_single_source(
                connector_class=ExcelConnector,
                connector_kwargs={
                    'file_path': file_path,
                    'sheet_name': sheet_name,
                    'chunk_size': 10000
                },
                file_path=file_path,
                file_size=file_size,
                base_name=dataset_name,
                description=description,
                user=user,
                connection=connection,
                source_type="excel",
                sheet_name=sheet_name,
                db=db
            )

            results.append(result)

        return results

    @staticmethod
    def get_user_datasets(user: User, db: Session) -> List[Dataset]:
        """Get all datasets for a user"""
        return db.query(Dataset).filter(Dataset.user_id == user.id).all()

    @staticmethod
    def get_dataset_by_id(dataset_id: str, user: User, db: Session) -> Optional[Dataset]:
        """Get a specific dataset by ID"""
        return db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.user_id == user.id
        ).first()

    @staticmethod
    def delete_dataset(dataset_id: str, user: User, db: Session) -> bool:
        """Delete a dataset"""
        dataset = DatasetService.get_dataset_by_id(dataset_id, user, db)

        if not dataset:
            return False

        # Delete file only if no other datasets reference it
        if dataset.file_path and os.path.exists(dataset.file_path):
            # Check if other datasets use this file
            other_datasets = db.query(Dataset).filter(
                Dataset.file_path == dataset.file_path,
                Dataset.id != dataset.id
            ).count()

            if other_datasets == 0:
                os.remove(dataset.file_path)

        db.delete(dataset)
        db.commit()

        return True

    @staticmethod
    def get_dataset_preview(dataset: Dataset, limit: int = 100) -> Dict[str, Any]:
        """Get preview of dataset data with preprocessing applied"""
        if dataset.status != "ready":
            raise Exception(f"Dataset is not ready. Status: {dataset.status}")

        # Create appropriate connector
        if dataset.source_type == "csv":
            connector = CSVConnector(dataset.file_path)
        elif dataset.source_type == "excel":
            connector = ExcelConnector(dataset.file_path, sheet_name=dataset.sheet_name)
        elif dataset.source_type == "json":
            connector = JSONConnector(dataset.file_path)
        elif dataset.source_type == "txt":
            connector = TXTConnector(dataset.file_path)
        elif dataset.source_type == "md":
            connector = MarkdownConnector(dataset.file_path)
        elif dataset.source_type == "mdx":
            connector = MDXConnector(dataset.file_path)
        elif dataset.source_type == "pdf":
            connector = PDFConnector(dataset.file_path)
        elif dataset.source_type == "mongodb":
            from ..connectors.mongodb_connector import MongoDBConnector
            connection = dataset.connection
            connector = MongoDBConnector(
                connection_string=connection.credentials.get('connection_string'),
                database=connection.credentials.get('database'),
                collection=dataset.source_identifier
            )
        else:
            raise Exception(f"Unsupported source type: {dataset.source_type}")

        if not connector.connect():
            raise Exception("Failed to connect to data source")

        df = connector.fetch_data(limit=limit)

        # CRITICAL: Preprocess data before sending to frontend
        preprocessed_df, _ = DataPreprocessingService.preprocess_dataframe(df)

        preview = {
            "columns": preprocessed_df.columns.tolist(),
            "rows": preprocessed_df.to_dict('records'),
            "total_rows": dataset.row_count,
            "preview_rows": len(preprocessed_df)
        }

        connector.disconnect()

        return preview

    @staticmethod
    def get_full_dataset_data(dataset: Dataset, chunk_size: int = 10000) -> Dict[str, Any]:
        """
        Get full dataset data for visualization (up to 100k rows)
        With preprocessing applied for clean visualization
        """
        if dataset.status != "ready":
            raise Exception(f"Dataset is not ready. Status: {dataset.status}")

        # Create appropriate connector
        if dataset.source_type == "csv":
            connector = CSVConnector(dataset.file_path, chunk_size=chunk_size)
        elif dataset.source_type == "excel":
            connector = ExcelConnector(dataset.file_path, sheet_name=dataset.sheet_name, chunk_size=chunk_size)
        elif dataset.source_type == "json":
            connector = JSONConnector(dataset.file_path, chunk_size=chunk_size)
        elif dataset.source_type == "txt":
            connector = TXTConnector(dataset.file_path, chunk_size=chunk_size)
        elif dataset.source_type == "md":
            connector = MarkdownConnector(dataset.file_path, chunk_size=chunk_size)
        elif dataset.source_type == "mdx":
            connector = MDXConnector(dataset.file_path, chunk_size=chunk_size)
        elif dataset.source_type == "pdf":
            connector = PDFConnector(dataset.file_path, chunk_size=chunk_size)
        elif dataset.source_type == "mongodb":
            from ..connectors.mongodb_connector import MongoDBConnector
            connection = dataset.connection
            connector = MongoDBConnector(
                connection_string=connection.credentials.get('connection_string'),
                database=connection.credentials.get('database'),
                collection=dataset.source_identifier,
                chunk_size=chunk_size
            )
        else:
            raise Exception(f"Unsupported source type: {dataset.source_type}")

        if not connector.connect():
            raise Exception("Failed to connect to data source")

        max_rows = 100000
        df = connector.fetch_data(limit=max_rows)

        # CRITICAL: Preprocess before visualization
        # This ensures clean, consistent data types for charts
        preprocessed_df, _ = DataPreprocessingService.preprocess_dataframe(df)

        result = {
            "columns": preprocessed_df.columns.tolist(),
            "data": preprocessed_df.to_dict('records'),
            "total_rows": dataset.row_count,
            "returned_rows": len(preprocessed_df),
            "is_partial": dataset.row_count > max_rows
        }

        connector.disconnect()

        return result

    @staticmethod
    def get_quality_report(dataset: Dataset) -> Optional[Dict[str, Any]]:
        """Extract quality report from dataset schema_info"""
        if dataset.schema_info and "quality_report" in dataset.schema_info:
            return dataset.schema_info["quality_report"]
        return None