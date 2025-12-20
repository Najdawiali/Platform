# backend/app/services/connection_service.py
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from ..models.connection import Connection, SourceType
from ..models.user import User
from ..connectors.csv_connector import CSVConnector
from ..connectors.excel_connector import ExcelConnector
from ..connectors.json_connector import JSONConnector
from ..connectors.txt_connector import TXTConnector
from ..connectors.markdown_connector import MarkdownConnector
from ..connectors.mdx_connector import MDXConnector
from ..connectors.pdf_connector import PDFConnector
from ..connectors.mongodb_connector import MongoDBConnector


# Future imports:
# from ..connectors.snowflake_connector import SnowflakeConnector
# from ..connectors.sqlserver_connector import SQLServerConnector


class ConnectionService:
    """Service for managing data source connections"""

    @staticmethod
    def get_required_fields(source_type: SourceType) -> List[Dict[str, Any]]:
        """Get required fields for a specific source type"""

        fields_map = {
            SourceType.CSV: [
                {"name": "file", "type": "file", "label": "CSV File", "required": True, "accept": ".csv"}
            ],
            SourceType.EXCEL: [
                {"name": "file", "type": "file", "label": "Excel File", "required": True, "accept": ".xlsx,.xls"}
            ],
            SourceType.JSON: [
                {"name": "file", "type": "file", "label": "JSON File", "required": True, "accept": ".json"}
            ],
            SourceType.TXT: [
                {"name": "file", "type": "file", "label": "TXT File", "required": True, "accept": ".txt"}
            ],
            SourceType.MD: [
                {"name": "file", "type": "file", "label": "Markdown File", "required": True, "accept": ".md"}
            ],
            SourceType.MDX: [
                {"name": "file", "type": "file", "label": "MDX File", "required": True, "accept": ".mdx"}
            ],
            SourceType.PDF: [
                {"name": "file", "type": "file", "label": "PDF File", "required": True, "accept": ".pdf"}
            ],
            SourceType.SNOWFLAKE: [
                {"name": "account", "type": "text", "label": "Account ID", "required": True,
                 "placeholder": "abc12345.us-east-1"},
                {"name": "username", "type": "text", "label": "Username", "required": True},
                {"name": "password", "type": "password", "label": "Password", "required": True},
                {"name": "warehouse", "type": "text", "label": "Warehouse", "required": True},
                {"name": "database", "type": "text", "label": "Database", "required": True},
                {"name": "schema_name", "type": "text", "label": "Schema (Optional)", "required": False},
                {"name": "role", "type": "text", "label": "Role (Optional)", "required": False}
            ],
            SourceType.SQLSERVER: [
                {"name": "host", "type": "text", "label": "Server Host", "required": True, "placeholder": "localhost"},
                {"name": "port", "type": "number", "label": "Port", "required": True, "default": 1433},
                {"name": "database", "type": "text", "label": "Database", "required": True},
                {"name": "username", "type": "text", "label": "Username", "required": True},
                {"name": "password", "type": "password", "label": "Password", "required": True}
            ],
            SourceType.MONGODB: [
                {"name": "connection_string", "type": "text", "label": "Connection String", "required": True,
                 "placeholder": "mongodb://localhost:27017"},
                {"name": "database", "type": "text", "label": "Database", "required": True}
            ],
            SourceType.POSTGRESQL: [
                {"name": "host", "type": "text", "label": "Host", "required": True, "placeholder": "localhost"},
                {"name": "port", "type": "number", "label": "Port", "required": True, "default": 5432},
                {"name": "database", "type": "text", "label": "Database", "required": True},
                {"name": "username", "type": "text", "label": "Username", "required": True},
                {"name": "password", "type": "password", "label": "Password", "required": True}
            ],
            SourceType.MYSQL: [
                {"name": "host", "type": "text", "label": "Host", "required": True, "placeholder": "localhost"},
                {"name": "port", "type": "number", "label": "Port", "required": True, "default": 3306},
                {"name": "database", "type": "text", "label": "Database", "required": True},
                {"name": "username", "type": "text", "label": "Username", "required": True},
                {"name": "password", "type": "password", "label": "Password", "required": True}
            ]
        }

        return fields_map.get(source_type, [])

    @staticmethod
    def get_instructions(source_type: SourceType) -> str:
        """Get instructions for connecting to a source type"""

        instructions_map = {
            SourceType.CSV: "Upload one or more CSV files to create datasets.",
            SourceType.EXCEL: "Upload an Excel file. Each sheet will be treated as a separate dataset.",
            SourceType.JSON: "Upload JSON files (supports both JSON arrays and newline-delimited JSON).",
            SourceType.TXT: "Upload text files (supports tab-delimited, space-delimited, and other common formats).",
            SourceType.MD: "Upload Markdown files (supports markdown tables and converts them to structured data).",
            SourceType.MDX: "Upload MDX files (Markdown with JSX). Tables will be extracted while JSX components are stripped.",
            SourceType.PDF: "Upload PDF files. Tables will be automatically extracted from PDF documents and converted to structured data.",
            SourceType.SNOWFLAKE: "Enter your Snowflake credentials. We'll fetch available databases and schemas after connection.",
            SourceType.SQLSERVER: "Enter your SQL Server connection details. We'll list available databases and tables.",
            SourceType.MONGODB: "Provide your MongoDB connection string and database name.",
            SourceType.POSTGRESQL: "Enter PostgreSQL connection details to connect to your database.",
            SourceType.MYSQL: "Enter MySQL connection details to connect to your database."
        }

        return instructions_map.get(source_type, "Configure your connection.")

    @staticmethod
    def test_connection(source_type: SourceType, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Test connection to data source"""

        try:
            if source_type == SourceType.CSV:
                # For file-based, just check file exists
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = CSVConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    schema = connector.get_schema()
                    connector.disconnect()
                    result["metadata"] = {
                        "row_count": schema["row_count"],
                        "column_count": schema["column_count"]
                    }

                return result

            elif source_type == SourceType.EXCEL:
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = ExcelConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    sheets_info = connector.get_sheet_info()
                    connector.disconnect()
                    result["metadata"] = {
                        "sheets": sheets_info,
                        "total_sheets": len(sheets_info)
                    }

                return result

            elif source_type == SourceType.JSON:
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = JSONConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    schema = connector.get_schema()
                    connector.disconnect()
                    result["metadata"] = {
                        "row_count": schema["row_count"],
                        "column_count": len(schema["columns"]),
                        "format": schema["format"]
                    }

                return result

            elif source_type == SourceType.TXT:
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = TXTConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    schema = connector.get_schema()
                    connector.disconnect()
                    result["metadata"] = {
                        "row_count": schema["row_count"],
                        "column_count": schema["column_count"],
                        "delimiter": schema.get("delimiter", "tab")
                    }

                return result

            elif source_type == SourceType.MD:
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = MarkdownConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    schema = connector.get_schema()
                    connector.disconnect()
                    result["metadata"] = {
                        "row_count": schema["row_count"],
                        "column_count": schema["column_count"],
                        "format": schema.get("format", "markdown")
                    }

                return result

            elif source_type == SourceType.MDX:
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = MDXConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    schema = connector.get_schema()
                    connector.disconnect()
                    result["metadata"] = {
                        "row_count": schema["row_count"],
                        "column_count": schema["column_count"],
                        "format": schema.get("format", "mdx")
                    }

                return result

            elif source_type == SourceType.PDF:
                file_path = credentials.get("file_path")
                if not file_path:
                    return {"success": False, "message": "File path required"}

                connector = PDFConnector(file_path)
                result = connector.test_connection()

                if result["success"]:
                    connector.connect()
                    schema = connector.get_schema()
                    connector.disconnect()
                    result["metadata"] = {
                        "row_count": schema["row_count"],
                        "column_count": schema["column_count"],
                        "format": schema.get("format", "pdf")
                    }

                return result

            elif source_type == SourceType.SNOWFLAKE:
                # TODO: Implement Snowflake test
                return {
                    "success": False,
                    "message": "Snowflake connector not yet implemented"
                }

            elif source_type == SourceType.SQLSERVER:
                # TODO: Implement SQL Server test
                return {
                    "success": False,
                    "message": "SQL Server connector not yet implemented"
                }

            elif source_type == SourceType.MONGODB:
                connection_string = credentials.get("connection_string")
                database = credentials.get("database")
                
                if not connection_string or not database:
                    return {
                        "success": False,
                        "message": "Connection string and database required"
                    }

                connector = MongoDBConnector(connection_string, database)
                result = connector.test_connection()

                if result["success"]:
                    result["metadata"] = {
                        "collections": result.get("collections", []),
                        "collection_count": result.get("collection_count", 0)
                    }

                return result

            elif source_type == SourceType.MYSQL:
                from ..connectors.mysql_connector import MySQLConnector
                
                host = credentials.get("host")
                port = credentials.get("port", 3306)
                database = credentials.get("database")
                username = credentials.get("username")
                password = credentials.get("password", "")
                
                if not all([host, database, username is not None]):
                    return {
                        "success": False,
                        "message": "Host, database, and username required"
                    }

                connector = MySQLConnector(host, port, database, username, password)
                result = connector.test_connection()

                if result["success"]:
                    result["metadata"] = {
                        "tables": result.get("tables", []),
                        "table_count": result.get("table_count", 0)
                    }

                return result

            else:
                return {
                    "success": False,
                    "message": f"Unsupported source type: {source_type}"
                }

        except Exception as e:
            return {
                "success": False,
                "message": f"Connection test failed: {str(e)}"
            }

    @staticmethod
    def check_duplicate_connection(
            user: User,
            source_type: SourceType,
            credentials: Dict[str, Any],
            db: Session
    ) -> Optional[Connection]:
        """Check if a connection with the same credentials already exists"""
        existing_connections = db.query(Connection).filter(
            Connection.user_id == user.id,
            Connection.source_type == source_type
        ).all()

        for conn in existing_connections:
            # For MongoDB, check if connection_string and database match
            if source_type == SourceType.MONGODB:
                if (conn.credentials.get("connection_string") == credentials.get("connection_string") and
                    conn.credentials.get("database") == credentials.get("database")):
                    return conn
            
            # For Snowflake, check account, warehouse, database, schema
            elif source_type == SourceType.SNOWFLAKE:
                if (conn.credentials.get("account") == credentials.get("account") and
                    conn.credentials.get("warehouse") == credentials.get("warehouse") and
                    conn.credentials.get("database") == credentials.get("database") and
                    conn.credentials.get("schema_name") == credentials.get("schema_name")):
                    return conn
            
            # For SQL databases (PostgreSQL, MySQL, SQL Server), check host, port, database
            elif source_type in [SourceType.POSTGRESQL, SourceType.MYSQL, SourceType.SQLSERVER]:
                if (conn.credentials.get("host") == credentials.get("host") and
                    conn.credentials.get("port") == credentials.get("port") and
                    conn.credentials.get("database") == credentials.get("database")):
                    return conn
            
            # For file-based sources, check file_path
            elif source_type in [SourceType.CSV, SourceType.EXCEL, SourceType.JSON, 
                                SourceType.TXT, SourceType.MD, SourceType.MDX, SourceType.PDF]:
                if conn.credentials.get("file_path") == credentials.get("file_path"):
                    return conn
        
        return None

    @staticmethod
    def create_connection(
            user: User,
            name: str,
            source_type: SourceType,
            credentials: Dict[str, Any],
            description: Optional[str],
            db: Session
    ) -> Connection:
        """Create a new connection"""

        # Check for duplicate connection
        existing_conn = ConnectionService.check_duplicate_connection(user, source_type, credentials, db)
        if existing_conn:
            raise ValueError(
                f"A connection to this {source_type.value} database already exists: '{existing_conn.name}'. "
                f"Please edit the existing connection instead of creating a new one."
            )

        # Test connection first
        test_result = ConnectionService.test_connection(source_type, credentials)

        connection = Connection(
            user_id=user.id,
            name=name,
            source_type=source_type,
            credentials=credentials,  # TODO: Encrypt in production!
            description=description,
            test_status="success" if test_result["success"] else "failed",
            test_message=test_result["message"]
        )

        db.add(connection)
        db.commit()
        db.refresh(connection)

        return connection

    @staticmethod
    def get_user_connections(user: User, db: Session) -> List[Connection]:
        """Get all connections for a user"""
        return db.query(Connection).filter(Connection.user_id == user.id).all()

    @staticmethod
    def get_connection_by_id(connection_id: str, user: User, db: Session) -> Optional[Connection]:
        """Get a specific connection"""
        return db.query(Connection).filter(
            Connection.id == connection_id,
            Connection.user_id == user.id
        ).first()

    @staticmethod
    def update_connection(
            connection_id: str,
            user: User,
            name: Optional[str],
            description: Optional[str],
            credentials: Optional[Dict[str, Any]],
            db: Session
    ) -> Optional[Connection]:
        """Update an existing connection"""
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            return None

        # Update fields if provided
        if name is not None:
            connection.name = name
        if description is not None:
            connection.description = description
        if credentials is not None:
            # Check for duplicates if credentials changed
            if credentials != connection.credentials:
                existing_conn = ConnectionService.check_duplicate_connection(
                    user, connection.source_type, credentials, db
                )
                # Allow update if duplicate is the same connection being updated
                if existing_conn and existing_conn.id != connection_id:
                    raise ValueError(
                        f"A connection to this {connection.source_type.value} database already exists: '{existing_conn.name}'. "
                        f"Cannot update to duplicate credentials."
                    )
            
            # Test new credentials
            test_result = ConnectionService.test_connection(connection.source_type, credentials)
            connection.credentials = credentials
            connection.test_status = "success" if test_result["success"] else "failed"
            connection.test_message = test_result["message"]

        db.commit()
        db.refresh(connection)
        return connection

    @staticmethod
    def delete_connection(connection_id: str, user: User, db: Session) -> bool:
        """Delete a connection"""
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            return False

        db.delete(connection)
        db.commit()
        return True
    
    @staticmethod
    def get_connection_collections(connection_id: str, user: User, db: Session) -> List[str]:
        """Get list of collections/tables from a database connection"""
        from fastapi import HTTPException, status
        
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )

        # Only MongoDB supported for now
        if connection.source_type == SourceType.MONGODB:
            connector = MongoDBConnector(
                connection_string=connection.credentials.get('connection_string'),
                database=connection.credentials.get('database')
            )
            try:
                connector.connect()
                all_collections = connector.get_collections()
                connector.disconnect()
                
                # Filter by selected collections if specified
                selected_collections = connection.credentials.get('selected_collections')
                if selected_collections:
                    # Return only selected collections that exist
                    return [c for c in selected_collections if c in all_collections]
                else:
                    # Return all collections if none selected
                    return all_collections
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get collections: {str(e)}"
                )
        
        # MySQL support
        elif connection.source_type == SourceType.MYSQL:
            from ..connectors.mysql_connector import MySQLConnector
            connector = MySQLConnector(
                host=connection.credentials.get('host'),
                port=connection.credentials.get('port'),
                database=connection.credentials.get('database'),
                username=connection.credentials.get('username'),
                password=connection.credentials.get('password', '')
            )
            try:
                connector.connect()
                all_tables = connector.get_tables()
                connector.disconnect()
                
                # Filter by selected tables if specified
                selected_tables = connection.credentials.get('selected_tables')
                if selected_tables:
                    return [t for t in selected_tables if t in all_tables]
                else:
                    return all_tables
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get tables: {str(e)}"
                )
        
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Getting collections/tables not supported for {connection.source_type}"
            )

    @staticmethod
    def query_connection_data(
        connection_id: str, 
        collection: str, 
        limit: int, 
        offset: int,
        user: User, 
        db: Session
    ) -> Dict[str, Any]:
        """Query data directly from a database connection"""
        from fastapi import HTTPException, status
        
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )

        # Only MongoDB supported for now
        if connection.source_type == SourceType.MONGODB:
            connector = MongoDBConnector(
                connection_string=connection.credentials.get('connection_string'),
                database=connection.credentials.get('database'),
                collection=collection
            )
            try:
                connector.connect()
                
                # Get total count
                total_count = connector.get_row_count()
                
                # Fetch data chunk
                df = connector.fetch_data(limit=limit, offset=offset)
                
                # Get schema
                schema = connector.get_schema()
                
                connector.disconnect()
                
                return {
                    "data": df.to_dict(orient='records'),
                    "columns": schema.get('columns', []),
                    "total_rows": total_count,
                    "returned_rows": len(df),
                    "offset": offset,
                    "limit": limit
                }
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to query data: {str(e)}"
                )
        
        # MySQL support
        elif connection.source_type == SourceType.MYSQL:
            from ..connectors.mysql_connector import MySQLConnector
            connector = MySQLConnector(
                host=connection.credentials.get('host'),
                port=connection.credentials.get('port'),
                database=connection.credentials.get('database'),
                username=connection.credentials.get('username'),
                password=connection.credentials.get('password', ''),
                table=collection  # 'collection' parameter is actually table name for MySQL
            )
            try:
                connector.connect()
                
                # Get total count
                total_count = connector.get_row_count()
                
                # Fetch data chunk
                df = connector.fetch_data(limit=limit, offset=offset)
                
                # Get schema
                schema = connector.get_schema()
                
                connector.disconnect()
                
                return {
                    "data": df.to_dict(orient='records'),
                    "columns": schema.get('columns', []),
                    "total_rows": total_count,
                    "returned_rows": len(df),
                    "offset": offset,
                    "limit": limit
                }
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to query data: {str(e)}"
                )
        
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Direct querying not supported for {connection.source_type}"
            )
