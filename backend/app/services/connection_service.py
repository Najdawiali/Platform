# backend/app/services/connection_service.py
import logging
from typing import Dict, Any, List, Optional, Tuple, Set
from datetime import datetime
import json
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.connection import Connection, SourceType
from ..models.table_snapshot import TableSnapshot
from ..models.user import User
from ..connectors.csv_connector import CSVConnector
from ..connectors.excel_connector import ExcelConnector
from ..connectors.json_connector import JSONConnector
from ..connectors.txt_connector import TXTConnector
from ..connectors.markdown_connector import MarkdownConnector
from ..connectors.mdx_connector import MDXConnector
from ..connectors.pdf_connector import PDFConnector
from ..connectors.mongodb_connector import MongoDBConnector
from ..connectors.postgresql_connector import PostgreSQLConnector
from ..connectors.salesforce_connector import SalesforceConnector


# Future imports:
# from ..connectors.snowflake_connector import SnowflakeConnector
# from ..connectors.sqlserver_connector import SQLServerConnector


class ConnectionService:
    """Service for managing data source connections"""

    logger = logging.getLogger(__name__)

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
            ],
            SourceType.SALESFORCE: [
                # OAuth is handled via a browser redirect. Credentials are stored after callback.
                {"name": "auth_type", "type": "text", "label": "Auth Type", "required": True, "default": "oauth"},
                {"name": "api_version", "type": "text", "label": "API Version (Optional)", "required": False, "placeholder": "e.g. 59.0"}
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
            ,
            SourceType.SALESFORCE: "Sign in with Salesforce (OAuth). Then select objects and fields to ingest."
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

            elif source_type == SourceType.SALESFORCE:
                auth_type = (credentials.get("auth_type") or "").strip().lower()
                refresh_token = credentials.get("refresh_token")
                if auth_type == "oauth" or refresh_token:
                    if not refresh_token:
                        return {"success": False, "message": "refresh_token is required for OAuth"}
                    connector = SalesforceConnector(
                        auth_type="oauth",
                        refresh_token=refresh_token,
                        access_token=credentials.get("access_token"),
                        instance_url=credentials.get("instance_url"),
                        auth_base_url=credentials.get("auth_base_url"),
                        api_version=credentials.get("api_version"),
                    )
                else:
                    username = credentials.get("username")
                    password = credentials.get("password")
                    token = credentials.get("token")
                    if not username or not password or not token:
                        return {"success": False, "message": "username, password, and token are required"}

                    connector = SalesforceConnector(
                        username=username,
                        password=password,
                        security_token=token,
                        login_domain=credentials.get("login_domain") or "login",
                        api_version=credentials.get("api_version"),
                    )
                result = connector.test_connection()
                
                # Fetch objects list for UI
                if result["success"]:
                    try:
                        objects = connector.list_objects()
                        result["metadata"] = {"objects": objects}
                    except Exception:
                        # Don't fail the connection test if we can't list objects
                        pass
                if result.get("success"):
                    connector.connect()
                    try:
                        objects = connector.list_objects()
                    except Exception as e:
                        msg = str(e)
                        return {"success": False, "message": msg}
                    finally:
                        connector.disconnect()

                    meta = {"objects": objects, "object_count": len(objects)}
                    if refresh_token:
                        meta["access_token"] = getattr(connector, "access_token", None)
                        meta["instance_url"] = getattr(connector, "instance_url", None)
                    result["metadata"] = meta
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

            elif source_type == SourceType.POSTGRESQL:
                host = credentials.get("host")
                port = credentials.get("port", 5432)
                database = credentials.get("database")
                username = credentials.get("username")
                password = credentials.get("password", "")
                schema = credentials.get("schema", "public")
                
                if not all([host, database, username is not None]):
                    return {
                        "success": False,
                        "message": "Host, database, and username required"
                    }

                connector = PostgreSQLConnector(host, port, database, username, password, schema)
                result = connector.test_connection()

                if result.get("status") == "success":
                    # Get tables
                    connector.connect()
                    tables = connector.list_tables()
                    schemas = connector.list_schemas()
                    connector.disconnect()
                    
                    return {
                        "success": True,
                        "message": result.get("message"),
                        "metadata": {
                            "tables": tables,
                            "table_count": len(tables),
                            "schemas": schemas,
                            "details": result.get("details")
                        }
                    }
                else:
                    return {
                        "success": False,
                        "message": result.get("message")
                    }

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

        target_db = credentials.get("database")

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
            
            # For SQL databases (PostgreSQL, MySQL, SQL Server)
            elif source_type in [SourceType.POSTGRESQL, SourceType.MYSQL, SourceType.SQLSERVER]:
                if source_type == SourceType.MYSQL:
                    # Treat duplicates as "same MySQL database" (host+port+database), regardless of username.
                    # This prevents connecting the same DB twice with the same connector.
                    if (conn.credentials.get("host") == credentials.get("host") and
                        conn.credentials.get("port") == credentials.get("port") and
                        target_db):

                        # Multi-db server connection shape
                        databases_map = conn.credentials.get("databases")
                        if isinstance(databases_map, dict) and len(databases_map) > 0:
                            if any(str(k).lower() == str(target_db).lower() for k in databases_map.keys()):
                                return conn

                        # Legacy single-db shape
                        existing_db = conn.credentials.get("database")
                        if existing_db and str(existing_db).lower() == str(target_db).lower():
                            return conn
                else:
                    # Database-scoped connection
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

        # Default per-connection sync settings (stored in credentials to avoid migrations)
        credentials = dict(credentials or {})
        credentials.setdefault("auto_sync_enabled", True)
        try:
            credentials.setdefault("auto_sync_interval_seconds", int(credentials.get("auto_sync_interval_seconds") or 3600))
        except Exception:
            credentials["auto_sync_interval_seconds"] = 3600
        # Baseline prevents immediate auto-sync after creation without implying a real sync happened.
        credentials.setdefault("auto_sync_baseline_at", datetime.utcnow().isoformat() + "Z")

        # Check for duplicate connection
        existing_conn = ConnectionService.check_duplicate_connection(user, source_type, credentials, db)

        # For MySQL, merge databases/tables into the existing server connection
        if existing_conn and source_type == SourceType.MYSQL:
            new_db = credentials.get("database")

            # If this exact database is already represented in the existing connection,
            # block creation and instruct the user to edit the existing connection.
            existing_creds = dict(existing_conn.credentials or {})
            existing_db = existing_creds.get("database")
            existing_db_map = existing_creds.get("databases")

            already_exists = False
            if new_db and isinstance(existing_db_map, dict) and len(existing_db_map) > 0:
                already_exists = any(str(k).lower() == str(new_db).lower() for k in existing_db_map.keys())
            elif new_db and existing_db and str(existing_db).lower() == str(new_db).lower():
                already_exists = True

            if already_exists:
                host = credentials.get("host") or existing_creds.get("host")
                port = credentials.get("port") or existing_creds.get("port")
                raise ValueError(
                    f"A MySQL connection for database '{new_db}' on '{host}:{port}' already exists as '{existing_conn.name}'. "
                    f"Please edit the existing connection to change the selected tables or sync it, or delete it to create a new connection."
                )

            merged = dict(existing_conn.credentials or {})

            merged.setdefault("auto_sync_enabled", True)
            try:
                merged.setdefault("auto_sync_interval_seconds", int(merged.get("auto_sync_interval_seconds") or 3600))
            except Exception:
                merged["auto_sync_interval_seconds"] = 3600
            merged.setdefault("auto_sync_baseline_at", datetime.utcnow().isoformat() + "Z")

            databases_map = merged.get("databases")
            if not isinstance(databases_map, dict):
                databases_map = {}

                # Convert legacy single-db shape into the multi-db shape
                legacy_db = merged.get("database")
                if legacy_db:
                    legacy_selected = merged.get("selected_tables")
                    if legacy_selected and isinstance(legacy_selected, list):
                        databases_map[legacy_db] = {"selected_tables": legacy_selected}
                    else:
                        databases_map[legacy_db] = {}

            if new_db:
                new_selected = credentials.get("selected_tables")

                if new_db not in databases_map:
                    databases_map[new_db] = {"selected_tables": new_selected} if (new_selected and isinstance(new_selected, list)) else {}
                else:
                    existing_selected = databases_map.get(new_db, {}).get("selected_tables") if isinstance(databases_map.get(new_db), dict) else None
                    # Missing selection means "all" (wins)
                    if not existing_selected or not isinstance(existing_selected, list):
                        databases_map[new_db] = {}
                    elif not new_selected or not isinstance(new_selected, list):
                        databases_map[new_db] = {}
                    else:
                        databases_map[new_db] = {"selected_tables": sorted(list(set(existing_selected) | set(new_selected)))}

            merged["databases"] = databases_map

            # Keep base connection fields up to date
            merged["host"] = credentials.get("host")
            merged["port"] = credentials.get("port", merged.get("port", 3306))
            merged["username"] = credentials.get("username")
            if credentials.get("password") is not None:
                merged["password"] = credentials.get("password")

            # Keep a primary database for compatibility (and for connection tests)
            if not merged.get("database"):
                merged["database"] = new_db

            # Remove ambiguous legacy selection
            merged.pop("selected_tables", None)

            test_result = ConnectionService.test_connection(SourceType.MYSQL, {
                "host": merged.get("host"),
                "port": merged.get("port", 3306),
                "database": merged.get("database") or new_db,
                "username": merged.get("username"),
                "password": merged.get("password", ""),
            })

            # Freeze schema snapshot for the database we just tested/added
            if test_result.get("success") and new_db:
                tables = (test_result.get("metadata") or {}).get("tables") or []
                snapshot = merged.get("schema_snapshot")
                if not isinstance(snapshot, dict):
                    snapshot = {}
                if isinstance(tables, list):
                    snapshot[new_db] = tables
                    # If this DB was previously "all" (empty dict), store explicit selection to prevent live reflection
                    db_cfg = databases_map.get(new_db)
                    if isinstance(db_cfg, dict) and not isinstance(db_cfg.get("selected_tables"), list):
                        databases_map[new_db] = {"selected_tables": tables}
                merged["schema_snapshot"] = snapshot
                merged["databases"] = databases_map

            existing_conn.credentials = merged
            existing_conn.test_status = "success" if test_result["success"] else "failed"
            existing_conn.test_message = test_result["message"]
            db.commit()
            db.refresh(existing_conn)
            return existing_conn

        if existing_conn:
            raise ValueError(
                f"A {source_type.value} connection with the same configuration already exists as '{existing_conn.name}'. "
                f"Please edit the existing connection (recommended) or delete it to create a new one."
            )

        # Test connection first
        test_result = ConnectionService.test_connection(source_type, credentials)

        # Store schema snapshot + default selection to freeze schema until next sync.
        if test_result.get("success"):
            metadata = test_result.get("metadata") or {}
            if source_type == SourceType.MONGODB:
                collections = metadata.get("collections") or []
                if isinstance(collections, list):
                    credentials["schema_snapshot"] = collections
                    # If user didn't explicitly choose, treat as "all at creation time"
                    if not isinstance(credentials.get("selected_collections"), list):
                        credentials["selected_collections"] = collections
            elif source_type == SourceType.MYSQL:
                tables = metadata.get("tables") or []
                if isinstance(tables, list):
                    credentials["schema_snapshot"] = tables
                    if not isinstance(credentials.get("selected_tables"), list):
                        credentials["selected_tables"] = tables
            elif source_type == SourceType.POSTGRESQL:
                tables = metadata.get("tables") or []
                if isinstance(tables, list):
                    credentials["schema_snapshot"] = tables
                    if not isinstance(credentials.get("selected_tables"), list):
                        credentials["selected_tables"] = tables

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
        conns = db.query(Connection).filter(Connection.user_id == user.id).all()
        for c in conns:
            try:
                creds = dict(c.credentials or {})
                setattr(c, "last_synced_at", creds.get("last_synced_at"))
            except Exception:
                setattr(c, "last_synced_at", None)
        return conns

    @staticmethod
    def get_connection_by_id(connection_id: str, user: User, db: Session) -> Optional[Connection]:
        """Get a specific connection"""
        conn = db.query(Connection).filter(
            Connection.id == connection_id,
            Connection.user_id == user.id
        ).first()
        if conn is not None:
            try:
                creds = dict(conn.credentials or {})
                setattr(conn, "last_synced_at", creds.get("last_synced_at"))
            except Exception:
                setattr(conn, "last_synced_at", None)
        return conn

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
            credentials = dict(credentials or {})
            credentials.setdefault("auto_sync_enabled", True)
            try:
                credentials.setdefault("auto_sync_interval_seconds", int(credentials.get("auto_sync_interval_seconds") or 3600))
            except Exception:
                credentials["auto_sync_interval_seconds"] = 3600
            # Reset schedule baseline on config change so it doesn't immediately auto-run.
            # Do not touch last_synced_at here.
            credentials["auto_sync_baseline_at"] = datetime.utcnow().isoformat() + "Z"

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

            # Refresh schema snapshot on update and (if selection missing) freeze to current snapshot.
            if test_result.get("success"):
                metadata = test_result.get("metadata") or {}
                if connection.source_type == SourceType.MONGODB:
                    collections = metadata.get("collections") or []
                    if isinstance(collections, list):
                        credentials["schema_snapshot"] = collections
                        if not isinstance(credentials.get("selected_collections"), list):
                            credentials["selected_collections"] = collections
                elif connection.source_type == SourceType.MYSQL:
                    tables = metadata.get("tables") or []
                    if isinstance(tables, list):
                        credentials["schema_snapshot"] = tables
                        if not isinstance(credentials.get("selected_tables"), list):
                            credentials["selected_tables"] = tables
                elif connection.source_type == SourceType.POSTGRESQL:
                    tables = metadata.get("tables") or []
                    if isinstance(tables, list):
                        credentials["schema_snapshot"] = tables
                        if not isinstance(credentials.get("selected_tables"), list):
                            credentials["selected_tables"] = tables

                elif connection.source_type == SourceType.SALESFORCE:
                    objects = metadata.get("objects") or []
                    if isinstance(objects, list):
                        credentials["schema_snapshot"] = objects
                        if not isinstance(credentials.get("selected_objects"), list):
                            credentials["selected_objects"] = objects
                    credentials.setdefault("selected_fields", {})
                    credentials.setdefault("retention_days", 90)

            connection.credentials = credentials
            connection.test_status = "success" if test_result["success"] else "failed"
            connection.test_message = test_result["message"]

        db.commit()
        db.refresh(connection)
        
        # For Salesforce, if objects and fields are selected, trigger sync to create datasets
        if connection.source_type == SourceType.SALESFORCE:
            selected_objects = credentials.get("selected_objects")
            selected_fields = credentials.get("selected_fields")
            if selected_objects and isinstance(selected_objects, list) and len(selected_objects) > 0:
                if selected_fields and isinstance(selected_fields, dict) and len(selected_fields) > 0:
                    # Trigger sync to create datasets for selected objects
                    try:
                        ConnectionService._sync_connection_record(connection, db)
                    except Exception as e:
                        # Log but don't fail the update
                        ConnectionService.logger.warning(
                            f"Failed to sync Salesforce connection after update: {e}"
                        )
        
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

        # If a file-type connection hits this endpoint, return empty instead of 400.
        # This avoids frontend spam (and makes intent obvious in logs).
        if connection.source_type in {
            SourceType.CSV,
            SourceType.EXCEL,
            SourceType.JSON,
            SourceType.TXT,
            SourceType.MD,
            SourceType.MDX,
            SourceType.PDF,
        }:
            ConnectionService.logger.info(
                "Collections requested for file connection; returning empty",
                extra={
                    "user_id": getattr(user, 'id', None),
                    "connection_id": connection_id,
                    "source_type": str(connection.source_type),
                },
            )
            return []

        # MongoDB support
        if connection.source_type == SourceType.MONGODB:
            try:
                selected = connection.credentials.get('selected_collections')
                if selected and isinstance(selected, list):
                    return selected
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return snapshot
                return []
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get collections: {str(e)}"
                )
        
        # MySQL support
        elif connection.source_type == SourceType.MYSQL:
            try:
                selected = connection.credentials.get('selected_tables')
                if selected and isinstance(selected, list):
                    return selected
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return snapshot
                return []
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get tables: {str(e)}"
                )
        
        # PostgreSQL support
        elif connection.source_type == SourceType.POSTGRESQL:
            try:
                selected = connection.credentials.get('selected_tables')
                if selected and isinstance(selected, list):
                    return selected
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return snapshot
                return []
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get tables: {str(e)}"
                )

        # Salesforce support
        elif connection.source_type == SourceType.SALESFORCE:
            try:
                selected = connection.credentials.get('selected_objects')
                if selected and isinstance(selected, list):
                    return selected
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return snapshot
                return []
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get objects: {str(e)}"
                )
        
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Getting collections/tables not supported for {connection.source_type}"
            )
    
    @staticmethod
    def get_databases_with_tables(connection_id: str, user: User, db: Session) -> Dict[str, List[str]]:
        """Get all databases with their tables/collections from a connection"""
        from fastapi import HTTPException, status
        
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )

        # If a file-type connection hits this endpoint, return empty instead of 400.
        # This prevents noisy 400s if the UI accidentally queries /databases for uploads.
        if connection.source_type in {
            SourceType.CSV,
            SourceType.EXCEL,
            SourceType.JSON,
            SourceType.TXT,
            SourceType.MD,
            SourceType.MDX,
            SourceType.PDF,
        }:
            ConnectionService.logger.info(
                "Databases requested for file connection; returning empty",
                extra={
                    "user_id": getattr(user, 'id', None),
                    "connection_id": connection_id,
                    "source_type": str(connection.source_type),
                },
            )
            return {}

        # MongoDB support (serve snapshot/selection only)
        if connection.source_type == SourceType.MONGODB:
            try:
                db_name = connection.credentials.get('database') or 'database'
                selected = connection.credentials.get('selected_collections')
                if selected and isinstance(selected, list):
                    return {db_name: selected}
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return {db_name: snapshot}
                return {db_name: []}
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get databases: {str(e)}"
                )
        
        # MySQL support (serve snapshot/selection only)
        elif connection.source_type == SourceType.MYSQL:
            try:
                databases_map = connection.credentials.get('databases')
                snapshot = connection.credentials.get('schema_snapshot')

                if isinstance(databases_map, dict) and len(databases_map) > 0:
                    out: Dict[str, List[str]] = {}
                    for db_name, db_cfg in databases_map.items():
                        selected = db_cfg.get('selected_tables') if isinstance(db_cfg, dict) else None
                        if selected and isinstance(selected, list):
                            out[db_name] = selected
                            continue
                        if isinstance(snapshot, dict):
                            snap_list = snapshot.get(db_name)
                            if snap_list and isinstance(snap_list, list):
                                out[db_name] = snap_list
                                continue
                        out[db_name] = []
                    return out

                db_name = connection.credentials.get('database') or 'database'
                selected = connection.credentials.get('selected_tables')
                if selected and isinstance(selected, list):
                    return {db_name: selected}
                if snapshot and isinstance(snapshot, list):
                    return {db_name: snapshot}
                return {db_name: []}
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get databases: {str(e)}"
                )
        
        # PostgreSQL support (serve snapshot/selection only)
        elif connection.source_type == SourceType.POSTGRESQL:
            try:
                connected_schema = connection.credentials.get('schema') or 'public'
                selected = connection.credentials.get('selected_tables')
                if selected and isinstance(selected, list):
                    return {connected_schema: selected}
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return {connected_schema: snapshot}
                return {connected_schema: []}
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get databases: {str(e)}"
                )

        # Salesforce support (present as single pseudo-database)
        elif connection.source_type == SourceType.SALESFORCE:
            try:
                # Present Salesforce as a single "database" named like the connection (org name once set).
                key = (connection.name or 'Salesforce').strip() or 'Salesforce'
                selected = connection.credentials.get('selected_objects')
                if selected and isinstance(selected, list):
                    return {key: selected}
                snapshot = connection.credentials.get('schema_snapshot')
                if snapshot and isinstance(snapshot, list):
                    return {key: snapshot}
                return {key: []}
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to get objects: {str(e)}"
                )
        
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Getting databases not supported for {connection.source_type}"
            )

    @staticmethod
    def get_salesforce_object_fields(
        connection_id: str,
        user: User,
        db: Session,
        object_name: str,
    ) -> List[Dict[str, Any]]:
        """Return Salesforce field metadata for a given object."""
        from fastapi import HTTPException, status

        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
        if connection.source_type != SourceType.SALESFORCE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a Salesforce connection")
        if not object_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="object_name is required")

        creds = dict(connection.credentials or {})
        auth_type = (creds.get("auth_type") or "").strip().lower()
        if auth_type == "oauth" or creds.get("refresh_token"):
            connector = SalesforceConnector(
                auth_type="oauth",
                refresh_token=creds.get("refresh_token"),
                access_token=creds.get("access_token"),
                instance_url=creds.get("instance_url"),
                auth_base_url=creds.get("auth_base_url"),
                api_version=creds.get("api_version"),
            )
        else:
            connector = SalesforceConnector(
                username=creds.get('username'),
                password=creds.get('password'),
                security_token=creds.get('token'),
                login_domain=creds.get('login_domain') or 'login',
                api_version=creds.get('api_version'),
            )

        if not connector.connect():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to connect to Salesforce")
        try:
            return connector.describe_object_fields(object_name)
        except Exception as e:
            msg = str(e)
            if "REQUEST_LIMIT_EXCEEDED" in msg:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=msg)
        finally:
            connector.disconnect()

    @staticmethod
    def query_connection_data(
        connection_id: str,
        collection: str,
        limit: int,
        offset: int,
        user: User,
        db: Session,
        database: Optional[str] = None
    ) -> Dict[str, Any]:
        """Query data directly from the source (Live Preview)."""
        from fastapi import HTTPException, status
        import pandas as pd
        
        print(f"[DEBUG] query_connection_data called for conn={connection_id}, collection={collection}, limit={limit}")
        
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            print(f"[DEBUG] Connection {connection_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )

        creds = dict(connection.credentials or {})
        source_type = connection.source_type
        print(f"[DEBUG] Source type: {source_type}")
        
        # Try live query first
        try:
            df = None
            connector = None
            
            if source_type == SourceType.POSTGRESQL:
                print("[DEBUG] Initializing PostgreSQL connector")
                connector = PostgreSQLConnector(
                    host=creds.get('host'),
                    port=creds.get('port'),
                    database=creds.get('database'),
                    username=creds.get('username'),
                    password=creds.get('password'),
                    table=collection,
                    schema=creds.get('schema', 'public')
                )
            elif source_type == SourceType.MYSQL:
                print("[DEBUG] Initializing MySQL connector")
                from ..connectors.mysql_connector import MySQLConnector
                connector = MySQLConnector(
                    host=creds.get('host'),
                    port=creds.get('port'),
                    database=creds.get('database'),
                    username=creds.get('username'),
                    password=creds.get('password'),
                    table=collection
                )
            elif source_type == SourceType.MONGODB:
                print("[DEBUG] Initializing MongoDB connector")
                connector = MongoDBConnector(
                    connection_string=creds.get('connection_string'),
                    database=database or creds.get('database'),
                    collection=collection
                )

            elif source_type == SourceType.SALESFORCE:
                print("[DEBUG] Initializing Salesforce connector")
                from ..connectors.salesforce_connector import SalesforceConnector
                fields_map = creds.get('selected_fields') if isinstance(creds.get('selected_fields'), dict) else {}
                selected_fields = fields_map.get(collection) if isinstance(fields_map.get(collection), list) else None
                auth_type = (creds.get("auth_type") or "").strip().lower()
                if auth_type == "oauth" or creds.get("refresh_token"):
                    connector = SalesforceConnector(
                        auth_type="oauth",
                        refresh_token=creds.get("refresh_token"),
                        access_token=creds.get("access_token"),
                        instance_url=creds.get("instance_url"),
                        auth_base_url=creds.get("auth_base_url"),
                        api_version=creds.get("api_version"),
                        object_name=collection,
                        fields=selected_fields,
                    )
                else:
                    connector = SalesforceConnector(
                        username=creds.get('username'),
                        password=creds.get('password'),
                        security_token=creds.get('token'),
                        login_domain=creds.get('login_domain') or 'login',
                        api_version=creds.get('api_version'),
                        object_name=collection,
                        fields=selected_fields,
                    )
            
            if connector:
                print("[DEBUG] Connecting...")
                if connector.connect():
                    try:
                        print(f"[DEBUG] Fetching data limit={limit} offset={offset}")
                        df = connector.fetch_data(limit=limit, offset=offset)
                        print(f"[DEBUG] Fetched {len(df) if df is not None else 'None'} rows")
                    except Exception as e:
                        print(f"[DEBUG] Error in fetch_data: {e}")
                        raise e
                    finally:
                        connector.disconnect()
                else:
                    print("[DEBUG] Failed to connect")
            
            if df is not None:
                # Convert to dict
                df = df.where(pd.notnull(df), None)
                
                # Infer columns
                columns = []
                for col in df.columns:
                    dtype = str(df[col].dtype)
                    col_type = 'string'
                    if 'int' in dtype: col_type = 'integer'
                    elif 'float' in dtype: col_type = 'float'
                    elif 'bool' in dtype: col_type = 'boolean'
                    elif 'datetime' in dtype: col_type = 'datetime'
                    
                    columns.append({
                        "name": col,
                        "type": col_type,
                        "nullable": True
                    })

                result = {
                    "rows": df.to_dict('records'),
                    "columns": columns,
                    "total_rows": len(df), # Approximate
                    "returned_rows": len(df),
                    "offset": offset,
                    "limit": limit,
                }
                print(f"[DEBUG] Returning live data: {len(result['rows'])} rows")
                return result
        except Exception as e:
            print(f"[DEBUG] Live preview failed, falling back to snapshot: {e}")
            import traceback
            traceback.print_exc()
            # Fallthrough to snapshot logic
            pass

        def _slice_rows(rows: List[Dict[str, Any]], off: int, lim: int) -> List[Dict[str, Any]]:
            if off < 0:
                off = 0
            if lim is None or lim <= 0:
                lim = 50
            return rows[off:off + lim]

        def _find_snapshot(
            connection_id_val: str,
            database_name_val: Optional[str],
            schema_name_val: Optional[str],
            table_name_val: str,
        ) -> Optional[TableSnapshot]:
            snap = (
                db.query(TableSnapshot)
                .filter(
                    TableSnapshot.connection_id == connection_id_val,
                    TableSnapshot.database_name == database_name_val,
                    TableSnapshot.schema_name == schema_name_val,
                    TableSnapshot.table_name == table_name_val,
                )
                .first()
            )
            if snap:
                return snap
            # Best-effort case-insensitive match for DB/schema names (users often vary casing)
            q = db.query(TableSnapshot).filter(TableSnapshot.connection_id == connection_id_val)
            if database_name_val is None:
                q = q.filter(TableSnapshot.database_name.is_(None))
            else:
                q = q.filter(func.lower(TableSnapshot.database_name) == str(database_name_val).lower())
            if schema_name_val is None:
                q = q.filter(TableSnapshot.schema_name.is_(None))
            else:
                q = q.filter(func.lower(TableSnapshot.schema_name) == str(schema_name_val).lower())
            q = q.filter(TableSnapshot.table_name == table_name_val)
            return q.first()

        # source_type = connection.source_type # Already defined above
        # creds = dict(connection.credentials or {}) # Already defined above

        if source_type == SourceType.MONGODB:
            selected_collections = creds.get('selected_collections')
            if selected_collections and isinstance(selected_collections, list) and collection not in selected_collections:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Collection not enabled for this connection")

            effective_db = database or creds.get('database')
            snap = _find_snapshot(connection.id, effective_db, None, collection)
            if not snap:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This collection has not been synced yet. Click Sync Now to capture a snapshot.",
                )

            all_rows: List[Dict[str, Any]] = snap.sample_rows or []
            page = _slice_rows(all_rows, offset, limit)
            return {
                "rows": page,
                "columns": snap.columns or [],
                "total_rows": int(snap.row_count or 0),
                "returned_rows": len(page),
                "offset": offset,
                "limit": limit,
            }

        if source_type == SourceType.SALESFORCE:
            selected_objects = creds.get('selected_objects')
            if selected_objects and isinstance(selected_objects, list) and collection not in selected_objects:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Object not enabled for this connection")

            # Use connection name as the database name (matches sync)
            sf_database_name = (connection.name or 'Salesforce').strip() or 'Salesforce'
            snap = _find_snapshot(connection.id, sf_database_name, None, collection)
            if not snap:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This object has not been synced yet. Click Sync Now to capture a snapshot.",
                )

            all_rows = snap.sample_rows or []
            page = _slice_rows(all_rows, offset, limit)
            return {
                "rows": page,
                "columns": snap.columns or [],
                "total_rows": int(snap.row_count or 0),
                "returned_rows": len(page),
                "offset": offset,
                "limit": limit,
            }

        elif source_type == SourceType.MYSQL:
            databases_map = creds.get('databases')
            effective_db = database or creds.get('database')

            if isinstance(databases_map, dict) and len(databases_map) > 0:
                if not database:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Database parameter is required for this connection")
                matched_db_key = next((k for k in databases_map.keys() if str(k).lower() == str(database).lower()), None)
                if matched_db_key is None:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Database not enabled for this connection")
                selected = databases_map.get(matched_db_key, {}).get('selected_tables') if isinstance(databases_map.get(matched_db_key), dict) else None
                if selected and isinstance(selected, list) and collection not in selected:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Table not enabled for this connection")
                effective_db = matched_db_key
            else:
                selected_tables = creds.get('selected_tables')
                if selected_tables and isinstance(selected_tables, list) and collection not in selected_tables:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Table not enabled for this connection")

            snap = _find_snapshot(connection.id, effective_db, None, collection)
            if not snap:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This table has not been synced yet. Click Sync Now to capture a snapshot.",
                )
            all_rows = snap.sample_rows or []
            page = _slice_rows(all_rows, offset, limit)
            return {
                "rows": page,
                "columns": snap.columns or [],
                "total_rows": int(snap.row_count or 0),
                "returned_rows": len(page),
                "offset": offset,
                "limit": limit,
            }

        elif source_type == SourceType.POSTGRESQL:
            selected_tables = creds.get('selected_tables')
            if selected_tables and isinstance(selected_tables, list) and collection not in selected_tables:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Table not enabled for this connection")

            effective_schema = database or creds.get('schema', 'public')
            snap = _find_snapshot(connection.id, creds.get('database'), effective_schema, collection)
            if not snap:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This table has not been synced yet. Click Sync Now to capture a snapshot.",
                )

            all_rows = snap.sample_rows or []
            page = _slice_rows(all_rows, offset, limit)
            return {
                "rows": page,
                "columns": snap.columns or [],
                "total_rows": int(snap.row_count or 0),
                "returned_rows": len(page),
                "offset": offset,
                "limit": limit,
            }

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Direct querying not supported for {connection.source_type}"
            )
    
    @staticmethod
    def get_connection_stats(connection_id: str, user: User, db: Session) -> Dict[str, Any]:
        """Get statistics about a database connection (total tables and total rows)"""
        from fastapi import HTTPException, status
        
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )

        try:
            # Snapshot-based stats: stable until sync runs.
            total_tables = int(db.query(func.count(TableSnapshot.id)).filter(TableSnapshot.connection_id == connection.id).scalar() or 0)
            total_rows = int(
                db.query(func.coalesce(func.sum(TableSnapshot.row_count), 0))
                .filter(TableSnapshot.connection_id == connection.id)
                .scalar()
                or 0
            )

            # If we don't have any snapshots yet (e.g., newly-created connection), fall back to schema selection count.
            if total_tables == 0:
                databases = ConnectionService.get_databases_with_tables(connection_id, user, db)
                total_tables = sum(len(tables) for tables in databases.values())
                total_rows = 0

            return {"total_tables": total_tables, "total_rows": total_rows}
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get connection stats: {str(e)}"
            )

    @staticmethod
    def get_connection_data(
        connection_id: str, 
        user: User, 
        db: Session, 
        collection: str, 
        limit: int = 100, 
        offset: int = 0, 
        database: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get data from a connection"""
        from fastapi import HTTPException, status
        
        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found"
            )

        try:
            connector = None

            # Salesforce previews should come from the latest Parquet snapshot (not live API).
            # The sync flow stores/updates a Dataset per object with schema_info["parquet_path"].
            if connection.source_type == SourceType.SALESFORCE:
                import os
                import pandas as pd
                import duckdb
                from sqlalchemy import func
                from ..models.dataset import Dataset

                dataset = (
                    db.query(Dataset)
                    .filter(
                        Dataset.user_id == user.id,
                        Dataset.connection_id == connection.id,
                        Dataset.source_identifier == collection,
                    )
                    .order_by(func.coalesce(Dataset.updated_at, Dataset.created_at).desc())
                    .first()
                )

                parquet_path = None
                if dataset and isinstance(dataset.schema_info, dict):
                    parquet_path = dataset.schema_info.get("parquet_path")

                if not parquet_path or not os.path.exists(str(parquet_path)):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"No Parquet snapshot found for Salesforce object '{collection}'. "
                            "Run a sync for this connection first."
                        ),
                    )

                schema_columns = []
                if dataset and isinstance(dataset.schema_info, dict):
                    schema = dataset.schema_info.get("schema") or {}
                    cols = schema.get("columns") or []
                    if isinstance(cols, list):
                        for c in cols:
                            if isinstance(c, dict) and c.get("name"):
                                schema_columns.append({"name": c.get("name")})

                con = duckdb.connect(database=":memory:")
                try:
                    result_df = con.execute(
                        "SELECT * FROM parquet_scan(?) LIMIT ? OFFSET ?",
                        [str(parquet_path), int(limit), int(offset)],
                    ).df()

                    if result_df is None or result_df.empty:
                        total_rows = dataset.row_count if dataset and isinstance(dataset.row_count, int) else 0
                        return {"columns": schema_columns, "data": [], "total_rows": total_rows}

                    result_df = result_df.where(pd.notnull(result_df), None)
                    data = result_df.to_dict("records")

                    # Prefer Dataset row_count if available; avoids COUNT(*) on big files.
                    total_rows = dataset.row_count if dataset and isinstance(dataset.row_count, int) else len(data)

                    # Prefer stored schema columns; fall back to parquet columns if missing.
                    if not schema_columns:
                        schema_columns = [{"name": c} for c in result_df.columns.tolist()]

                    return {"columns": schema_columns, "data": data, "total_rows": total_rows}
                finally:
                    con.close()

            # NOTE:
            # - For PostgreSQL, UI sends a "database" value that represents schema.
            # - For MySQL, UI sends a "database" value that represents the database name.
            # - For MongoDB, UI sends a "database" value that represents the database name.
            if connection.source_type == SourceType.MONGODB:
                connector = MongoDBConnector(
                    connection_string=connection.credentials.get("connection_string"),
                    database=database or connection.credentials.get("database"),
                    collection=collection,
                )
            elif connection.source_type == SourceType.POSTGRESQL:
                connector = PostgreSQLConnector(
                    host=connection.credentials.get("host"),
                    port=connection.credentials.get("port"),
                    database=connection.credentials.get("database"),
                    username=connection.credentials.get("username"),
                    password=connection.credentials.get("password"),
                    schema=database or connection.credentials.get("schema") or "public",
                    table=collection,
                )
            elif connection.source_type == SourceType.MYSQL:
                from ..connectors.mysql_connector import MySQLConnector

                connector = MySQLConnector(
                    host=connection.credentials.get("host"),
                    port=connection.credentials.get("port"),
                    database=database or connection.credentials.get("database"),
                    username=connection.credentials.get("username"),
                    password=connection.credentials.get("password"),
                    table=collection,
                )

            if not connector:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Data preview not supported for {connection.source_type}",
                )

            if not connector.connect():
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to connect to database",
                )

            try:
                # Always use connector-provided schema so the UI only sees original column names.
                # This avoids "fake" columns caused by pandas inference.
                schema_info = connector.get_schema() or {}
                schema_columns = schema_info.get("columns") or []

                df = connector.fetch_data(limit=limit, offset=offset)
                if df is None or df.empty:
                    return {"columns": schema_columns, "data": [], "total_rows": schema_info.get("row_count", 0)}

                data = json.loads(df.to_json(orient="records", date_format="iso"))

                # Prefer connector row_count when available; fall back to returned page size.
                total_rows = schema_info.get("row_count")
                if not isinstance(total_rows, int):
                    total_rows = len(data)

                return {
                    "columns": schema_columns,
                    "data": data,
                    "total_rows": total_rows,
                }
            finally:
                connector.disconnect()

        except HTTPException:
            raise
        except Exception as e:
            msg = str(e)
            if "REQUEST_LIMIT_EXCEEDED" in msg:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch data: {msg}"
            )



    @staticmethod
    def sync_connection(connection_id: str, user: User, db: Session) -> Dict[str, Any]:
        """Sync a connection by re-reading schema (tables/collections) using saved credentials."""
        from fastapi import HTTPException, status

        connection = ConnectionService.get_connection_by_id(connection_id, user, db)
        if not connection:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

        result = ConnectionService._sync_connection_record(connection, db)

        # Mark last successful sync time for UI display
        if result.get("success"):
            updated_creds: Dict[str, Any] = dict(connection.credentials or {})
            updated_creds["last_synced_at"] = datetime.utcnow().isoformat() + "Z"
            updated_creds.setdefault("auto_sync_baseline_at", datetime.utcnow().isoformat() + "Z")
            connection.credentials = updated_creds
            db.commit()
            db.refresh(connection)

        return result


    @staticmethod
    def sync_connection_system(connection_id: str, db: Session) -> Dict[str, Any]:
        """System-level sync (used by scheduler). Does not require a user context."""
        from fastapi import HTTPException, status

        connection = db.query(Connection).filter(Connection.id == connection_id).first()
        if not connection:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

        # Per-connection scheduling is stored in credentials to avoid DB migrations
        creds: Dict[str, Any] = dict(connection.credentials or {})
        enabled = creds.get("auto_sync_enabled")
        if enabled is False:
            return {
                "connection_id": connection.id,
                "source_type": connection.source_type.value if hasattr(connection.source_type, 'value') else str(connection.source_type),
                "success": True,
                "message": "Auto-sync disabled",
                "changes": {"removed": []},
                "skipped": True,
            }

        interval_seconds = creds.get("auto_sync_interval_seconds")
        try:
            interval_seconds = int(interval_seconds) if interval_seconds is not None else 3600
        except Exception:
            interval_seconds = 3600
        if interval_seconds <= 0:
            interval_seconds = 3600

        # Due calculation prefers true last sync time, otherwise uses baseline.
        last_synced_raw = creds.get("last_synced_at")
        baseline_raw = creds.get("auto_sync_baseline_at") or creds.get("auto_sync_last_run_at")

        def _parse_iso(raw: Any) -> Optional[datetime]:
            if not isinstance(raw, str) or not raw:
                return None
            try:
                return datetime.fromisoformat(raw.replace('Z', '+00:00')).replace(tzinfo=None)
            except Exception:
                return None

        last_synced = _parse_iso(last_synced_raw)
        baseline = _parse_iso(baseline_raw)

        now = datetime.utcnow()
        # If we have neither a last sync nor a baseline, set a baseline and wait for the interval.
        if last_synced is None and baseline is None:
            updated_creds: Dict[str, Any] = dict(connection.credentials or {})
            updated_creds["auto_sync_enabled"] = True if enabled is None else bool(enabled)
            updated_creds["auto_sync_interval_seconds"] = interval_seconds
            updated_creds["auto_sync_baseline_at"] = now.isoformat() + "Z"
            connection.credentials = updated_creds
            db.commit()
            db.refresh(connection)
            return {
                "connection_id": connection.id,
                "source_type": connection.source_type.value if hasattr(connection.source_type, 'value') else str(connection.source_type),
                "success": True,
                "message": "Initialized schedule",
                "changes": {"removed": []},
                "skipped": True,
            }

        anchor = last_synced or baseline
        elapsed = (now - anchor).total_seconds() if anchor is not None else 0
        if elapsed < interval_seconds:
            return {
                "connection_id": connection.id,
                "source_type": connection.source_type.value if hasattr(connection.source_type, 'value') else str(connection.source_type),
                "success": True,
                "message": "Not due",
                "changes": {"removed": []},
                "skipped": True,
            }

        result = ConnectionService._sync_connection_record(connection, db)

        # Update baseline and last_synced_at (only on success)
        updated_creds: Dict[str, Any] = dict(connection.credentials or {})
        updated_creds["auto_sync_enabled"] = True if enabled is None else bool(enabled)
        updated_creds["auto_sync_interval_seconds"] = interval_seconds
        updated_creds.setdefault("auto_sync_baseline_at", now.isoformat() + "Z")
        if result.get("success"):
            updated_creds["last_synced_at"] = now.isoformat() + "Z"
        connection.credentials = updated_creds
        db.commit()
        db.refresh(connection)

        return result


    @staticmethod
    def _sync_connection_record(connection: Connection, db: Session) -> Dict[str, Any]:
        """Internal helper that performs sync on an already-loaded Connection record."""
        from fastapi import HTTPException, status

        source_type = connection.source_type
        creds: Dict[str, Any] = dict(connection.credentials or {})

        test_result = ConnectionService.test_connection(source_type, creds)
        connection.test_status = "success" if test_result.get("success") else "failed"
        connection.test_message = test_result.get("message")
        connection.last_tested = datetime.utcnow()

        if not test_result.get("success"):
            db.commit()
            return {
                "connection_id": connection.id,
                "source_type": source_type.value if hasattr(source_type, 'value') else str(source_type),
                "success": False,
                "message": connection.test_message or "Sync failed",
                "changes": {"removed": []},
            }

        removed: List[str] = []
        changes: Dict[str, Any] = {
            "removed": removed,
            "tables_added": [],
            "tables_removed": [],
            "columns_added": {},
            "columns_removed": {},
            "row_count_delta": {},
        }

        def _make_json_safe(val: Any) -> Any:
            try:
                json.dumps(val)
                return val
            except Exception:
                return str(val)

        def _rows_to_json_safe(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            safe: List[Dict[str, Any]] = []
            for r in rows or []:
                if not isinstance(r, dict):
                    continue
                out: Dict[str, Any] = {}
                for k, v in r.items():
                    out[str(k)] = _make_json_safe(v)
                safe.append(out)
            return safe

        def _col_names(cols: Any) -> Set[str]:
            if not cols:
                return set()
            if isinstance(cols, list):
                names: Set[str] = set()
                for c in cols:
                    if isinstance(c, dict) and c.get("name") is not None:
                        names.add(str(c.get("name")))
                    else:
                        names.add(str(c))
                return names
            return set()

        def _snapshot_key(db_name: Optional[str], schema_name: Optional[str], table_name: str) -> Tuple[Optional[str], Optional[str], str]:
            return (db_name, schema_name, table_name)

        def _get_existing_snapshots() -> Dict[Tuple[Optional[str], Optional[str], str], TableSnapshot]:
            snaps = db.query(TableSnapshot).filter(TableSnapshot.connection_id == connection.id).all()
            out: Dict[Tuple[Optional[str], Optional[str], str], TableSnapshot] = {}
            for s in snaps:
                out[_snapshot_key(s.database_name, s.schema_name, s.table_name)] = s
            return out

        def _upsert_snapshot(
            db_name: Optional[str],
            schema_name: Optional[str],
            table_name: str,
            columns: Any,
            row_count: Optional[int],
            sample_rows: List[Dict[str, Any]],
        ) -> None:
            existing = (
                db.query(TableSnapshot)
                .filter(
                    TableSnapshot.connection_id == connection.id,
                    TableSnapshot.database_name == db_name,
                    TableSnapshot.schema_name == schema_name,
                    TableSnapshot.table_name == table_name,
                )
                .first()
            )
            if existing is None:
                changes["tables_added"].append({"database": db_name, "schema": schema_name, "table": table_name})
                existing = TableSnapshot(
                    connection_id=connection.id,
                    database_name=db_name,
                    schema_name=schema_name,
                    table_name=table_name,
                )
                db.add(existing)
                prev_cols = set()
                prev_count = None
            else:
                prev_cols = _col_names(existing.columns)
                prev_count = existing.row_count

            new_cols = _col_names(columns)
            added_cols = sorted(list(new_cols - prev_cols))
            removed_cols = sorted(list(prev_cols - new_cols))
            if added_cols:
                changes["columns_added"].setdefault(table_name, []).extend(added_cols)
            if removed_cols:
                changes["columns_removed"].setdefault(table_name, []).extend(removed_cols)
            if prev_count is not None and row_count is not None and int(prev_count) != int(row_count):
                changes["row_count_delta"][table_name] = int(row_count) - int(prev_count)

            existing.columns = columns
            existing.row_count = int(row_count) if row_count is not None else None
            existing.sample_rows = _rows_to_json_safe(sample_rows)
            existing.synced_at = datetime.utcnow()

        def _prune_snapshots(tracked: Set[Tuple[Optional[str], Optional[str], str]]) -> None:
            existing = _get_existing_snapshots()
            for key, snap in existing.items():
                if key not in tracked:
                    changes["tables_removed"].append({"database": snap.database_name, "schema": snap.schema_name, "table": snap.table_name})
                    db.delete(snap)

        try:
            if source_type == SourceType.MONGODB:
                import os
                import re
                import shutil
                from datetime import timedelta
                from ..models.dataset import Dataset
                from ..services.dataset_service import DatasetService

                user = db.query(User).filter(User.id == connection.user_id).first()
                if not user:
                    raise Exception("User not found for connection")

                prev_snapshot = creds.get('schema_snapshot') if isinstance(creds.get('schema_snapshot'), list) else None
                connector = MongoDBConnector(
                    connection_string=creds.get('connection_string'),
                    database=creds.get('database')
                )
                connector.connect()
                all_collections = connector.get_collections()
                connector.disconnect()

                # Always store snapshot
                creds['schema_snapshot'] = all_collections

                selected = creds.get('selected_collections')
                if selected and isinstance(selected, list):
                    # If the previous selection equaled the previous snapshot, treat it as "select all"
                    if prev_snapshot is not None and set(selected) == set(prev_snapshot):
                        creds['selected_collections'] = all_collections
                    else:
                        filtered = [c for c in selected if c in all_collections]
                        creds['selected_collections'] = filtered
                else:
                    # Previously "all" without an explicit list; freeze to snapshot
                    creds['selected_collections'] = all_collections

                # Snapshot data for tracked collections
                tracked_cols = creds.get('selected_collections') if isinstance(creds.get('selected_collections'), list) else []
                tracked_keys: Set[Tuple[Optional[str], Optional[str], str]] = set(
                    _snapshot_key(creds.get('database'), None, c) for c in tracked_cols
                )
                _prune_snapshots(tracked_keys)

                base_dir = os.path.join("./uploads", user.id, "mongodb", connection.id)
                now = datetime.utcnow()
                snapshot_label = now.strftime("%Y%m%dT%H%M%SZ")

                for c in tracked_cols:
                    try:
                        c_connector = MongoDBConnector(
                            connection_string=creds.get('connection_string'),
                            database=creds.get('database'),
                            collection=c,
                        )
                        
                        # Find or create dataset for this collection
                        dataset = (
                            db.query(Dataset)
                            .filter(Dataset.connection_id == connection.id, Dataset.source_identifier == c)
                            .first()
                        )
                        if dataset is None:
                            dataset = Dataset(
                                user_id=user.id,
                                connection_id=connection.id,
                                name=c,
                                description=f"MongoDB collection: {c}",
                                source_type="mongodb",
                                source_identifier=c,
                                status="processing",
                            )
                            db.add(dataset)
                            db.commit()
                            db.refresh(dataset)

                        parquet_path = os.path.join(base_dir, c, "snapshots", snapshot_label, "data.parquet")
                        DatasetService.refresh_dataset_from_connector(dataset, c_connector, parquet_path, db=db)

                        c_connector.connect()
                        schema = c_connector.get_schema() or {}
                        row_count = c_connector.get_row_count()
                        df = c_connector.fetch_data(limit=50, offset=0)
                        c_connector.disconnect()

                        _upsert_snapshot(
                            creds.get('database'),
                            None,
                            c,
                            schema.get('columns', []),
                            int(row_count) if row_count is not None else None,
                            df.to_dict(orient='records') if df is not None else [],
                        )
                    except Exception as e:
                        print(f"Error syncing MongoDB collection '{c}': {e}")
                        continue

                # Delete snapshots older than 3 days (Retention Policy)
                retention_days = 3
                cutoff = now - timedelta(days=retention_days)
                ts_re = re.compile(r"^\d{8}T\d{6}Z$")
                for c in tracked_cols:
                    snapshots_root = os.path.join(base_dir, c, "snapshots")
                    if not os.path.isdir(snapshots_root):
                        continue
                    for entry in os.listdir(snapshots_root):
                        if not ts_re.match(entry or ""):
                            continue
                        try:
                            dt = datetime.strptime(entry, "%Y%m%dT%H%M%SZ")
                        except Exception:
                            continue
                        if dt < cutoff:
                            shutil.rmtree(os.path.join(snapshots_root, entry), ignore_errors=True)

            elif source_type == SourceType.POSTGRESQL:
                prev_snapshot = creds.get('schema_snapshot') if isinstance(creds.get('schema_snapshot'), list) else None
                connector = PostgreSQLConnector(
                    host=creds.get('host'),
                    port=creds.get('port'),
                    database=creds.get('database'),
                    username=creds.get('username'),
                    password=creds.get('password', ''),
                    schema=creds.get('schema', 'public')
                )
                connector.connect()
                all_tables = connector.list_tables()
                connector.disconnect()

                creds['schema_snapshot'] = all_tables

                selected = creds.get('selected_tables')
                if selected and isinstance(selected, list):
                    if prev_snapshot is not None and set(selected) == set(prev_snapshot):
                        creds['selected_tables'] = all_tables
                    else:
                        filtered = [t for t in selected if t in all_tables]
                        removed = [t for t in selected if t not in all_tables]
                        creds['selected_tables'] = filtered
                else:
                    creds['selected_tables'] = all_tables

                tracked_tables = creds.get('selected_tables') if isinstance(creds.get('selected_tables'), list) else []
                effective_schema = creds.get('schema', 'public')
                tracked_keys = set(_snapshot_key(creds.get('database'), effective_schema, t) for t in tracked_tables)
                _prune_snapshots(tracked_keys)
                for t in tracked_tables:
                    try:
                        t_connector = PostgreSQLConnector(
                            host=creds.get('host'),
                            port=creds.get('port'),
                            database=creds.get('database'),
                            username=creds.get('username'),
                            password=creds.get('password', ''),
                            schema=effective_schema,
                            table=t,
                        )
                        t_connector.connect()
                        row_count = t_connector.get_row_count()
                        df = t_connector.get_sample_data(table_name=t, limit=50)
                        schema_map = t_connector.infer_schema(t) or {}
                        t_connector.disconnect()
                        formatted_columns = [{"name": cn, "type": ct} for cn, ct in schema_map.items()]
                        _upsert_snapshot(
                            creds.get('database'),
                            effective_schema,
                            t,
                            formatted_columns,
                            int(row_count) if row_count is not None else None,
                            df.to_dict(orient='records') if df is not None else [],
                        )
                    except Exception:
                        continue

            elif source_type == SourceType.MYSQL:
                from ..connectors.mysql_connector import MySQLConnector

                databases_map = creds.get('databases')
                primary_db = creds.get('database')
                if not primary_db and isinstance(databases_map, dict) and len(databases_map) > 0:
                    primary_db = sorted(list(databases_map.keys()))[0]

                connector = MySQLConnector(
                    host=creds.get('host'),
                    port=creds.get('port', 3306),
                    database=primary_db or creds.get('database'),
                    username=creds.get('username'),
                    password=creds.get('password', '')
                )
                connector.connect()

                if isinstance(databases_map, dict) and len(databases_map) > 0:
                    snapshot_map = creds.get('schema_snapshot')
                    if not isinstance(snapshot_map, dict):
                        snapshot_map = {}

                    for db_name, db_cfg in list(databases_map.items()):
                        try:
                            all_tables = connector.get_tables(database=db_name)
                        except Exception:
                            removed.append(f"{db_name}.*")
                            databases_map.pop(db_name, None)
                            continue

                        prev_db_snapshot = snapshot_map.get(db_name) if isinstance(snapshot_map.get(db_name), list) else None
                        snapshot_map[db_name] = all_tables

                        selected = db_cfg.get('selected_tables') if isinstance(db_cfg, dict) else None
                        if selected and isinstance(selected, list):
                            # If selection equaled previous snapshot, treat it as "select all"
                            if prev_db_snapshot is not None and set(selected) == set(prev_db_snapshot):
                                databases_map[db_name] = {"selected_tables": all_tables}
                            else:
                                filtered = [t for t in selected if t in all_tables]
                                missing = [t for t in selected if t not in all_tables]
                                if missing:
                                    removed.extend([f"{db_name}.{t}" for t in missing])
                                databases_map[db_name] = {"selected_tables": filtered}
                        else:
                            # Previously "all" without explicit list; freeze to snapshot
                            databases_map[db_name] = {"selected_tables": all_tables}

                    creds['databases'] = databases_map
                    creds['schema_snapshot'] = snapshot_map

                    # Snapshot data for all tracked tables across enabled DBs
                    tracked_keys: Set[Tuple[Optional[str], Optional[str], str]] = set()
                    for db_name, cfg in databases_map.items():
                        if not isinstance(cfg, dict):
                            continue
                        selected_tbls = cfg.get('selected_tables')
                        if not isinstance(selected_tbls, list):
                            continue
                        for t in selected_tbls:
                            tracked_keys.add(_snapshot_key(db_name, None, t))
                    _prune_snapshots(tracked_keys)

                    for db_name, cfg in databases_map.items():
                        if not isinstance(cfg, dict):
                            continue
                        selected_tbls = cfg.get('selected_tables')
                        if not isinstance(selected_tbls, list):
                            continue
                        for t in selected_tbls:
                            try:
                                t_connector = MySQLConnector(
                                    host=creds.get('host'),
                                    port=creds.get('port', 3306),
                                    database=db_name,
                                    username=creds.get('username'),
                                    password=creds.get('password', ''),
                                    table=t,
                                )
                                t_connector.connect()
                                row_count = t_connector.get_row_count()
                                df = t_connector.fetch_data(limit=50, offset=0)
                                schema = t_connector.get_schema() or {}
                                t_connector.disconnect()
                                _upsert_snapshot(
                                    db_name,
                                    None,
                                    t,
                                    schema.get('columns', []),
                                    int(row_count) if row_count is not None else None,
                                    df.to_dict(orient='records') if df is not None else [],
                                )
                            except Exception:
                                try:
                                    t_connector.disconnect()
                                except Exception:
                                    pass
                                continue
                else:
                    prev_snapshot = creds.get('schema_snapshot') if isinstance(creds.get('schema_snapshot'), list) else None
                    selected = creds.get('selected_tables')
                    all_tables = connector.get_tables()
                    creds['schema_snapshot'] = all_tables

                    if selected and isinstance(selected, list):
                        if prev_snapshot is not None and set(selected) == set(prev_snapshot):
                            creds['selected_tables'] = all_tables
                        else:
                            filtered = [t for t in selected if t in all_tables]
                            missing = [t for t in selected if t not in all_tables]
                            if missing:
                                removed.extend(missing)
                            creds['selected_tables'] = filtered
                    else:
                        creds['selected_tables'] = all_tables

                    tracked_tables = creds.get('selected_tables') if isinstance(creds.get('selected_tables'), list) else []
                    tracked_keys: Set[Tuple[Optional[str], Optional[str], str]] = set(
                        _snapshot_key(creds.get('database'), None, t) for t in tracked_tables
                    )
                    _prune_snapshots(tracked_keys)

                    for t in tracked_tables:
                        try:
                            t_connector = MySQLConnector(
                                host=creds.get('host'),
                                port=creds.get('port', 3306),
                                database=creds.get('database'),
                                username=creds.get('username'),
                                password=creds.get('password', ''),
                                table=t,
                            )
                            t_connector.connect()
                            row_count = t_connector.get_row_count()
                            df = t_connector.fetch_data(limit=50, offset=0)
                            schema = t_connector.get_schema() or {}
                            t_connector.disconnect()
                            _upsert_snapshot(
                                creds.get('database'),
                                None,
                                t,
                                schema.get('columns', []),
                                int(row_count) if row_count is not None else None,
                                df.to_dict(orient='records') if df is not None else [],
                            )
                        except Exception:
                            continue

                connector.disconnect()

            elif source_type == SourceType.SALESFORCE:
                import os
                import re
                import shutil
                from datetime import timedelta

                # Resolve user (required for dataset ownership + upload paths)
                user = db.query(User).filter(User.id == connection.user_id).first()
                if not user:
                    raise Exception("User not found for connection")

                prev_snapshot = creds.get('schema_snapshot') if isinstance(creds.get('schema_snapshot'), list) else None

                auth_type = (creds.get("auth_type") or "").strip().lower()
                oauth_refresh_token = creds.get("refresh_token")

                # Fetch all available objects (OAuth refresh happens once here)
                if auth_type == "oauth" or oauth_refresh_token:
                    sf = SalesforceConnector(
                        auth_type="oauth",
                        refresh_token=oauth_refresh_token,
                        access_token=creds.get("access_token"),
                        instance_url=creds.get("instance_url"),
                        auth_base_url=creds.get("auth_base_url"),
                        api_version=creds.get('api_version'),
                    )
                else:
                    sf = SalesforceConnector(
                        username=creds.get('username'),
                        password=creds.get('password'),
                        security_token=creds.get('token'),
                        login_domain=creds.get('login_domain') or 'login',
                        api_version=creds.get('api_version'),
                    )

                if not sf.connect():
                    raise Exception("Failed to connect to Salesforce")
                try:
                    all_objects = sf.list_objects()
                    if auth_type == "oauth" or oauth_refresh_token:
                        creds["auth_type"] = "oauth"
                        if getattr(sf, "access_token", None):
                            creds["access_token"] = getattr(sf, "access_token")
                        if getattr(sf, "instance_url", None):
                            creds["instance_url"] = getattr(sf, "instance_url")
                finally:
                    sf.disconnect()

                creds['schema_snapshot'] = all_objects

                # Maintain selection semantics ("select all" -> freeze to latest snapshot)
                selected = creds.get('selected_objects')
                if selected and isinstance(selected, list):
                    if prev_snapshot is not None and set(selected) == set(prev_snapshot):
                        creds['selected_objects'] = all_objects
                    else:
                        filtered = [o for o in selected if o in all_objects]
                        removed_objs = [o for o in selected if o not in all_objects]
                        if removed_objs:
                            removed.extend(removed_objs)
                        creds['selected_objects'] = filtered
                else:
                    creds['selected_objects'] = all_objects

                # Retention config (snapshots on disk)
                retention_days = creds.get('retention_days')
                try:
                    retention_days = int(retention_days) if retention_days is not None else 90
                except Exception:
                    retention_days = 90
                if retention_days <= 0:
                    retention_days = 90
                creds['retention_days'] = retention_days

                fields_map = creds.get('selected_fields') if isinstance(creds.get('selected_fields'), dict) else {}
                creds['selected_fields'] = fields_map

                # Use connection name (org name) as the database name
                sf_database_name = (connection.name or 'Salesforce').strip() or 'Salesforce'
                
                tracked_objects = creds.get('selected_objects') if isinstance(creds.get('selected_objects'), list) else []
                tracked_keys: Set[Tuple[Optional[str], Optional[str], str]] = set(
                    _snapshot_key(sf_database_name, None, o) for o in tracked_objects
                )
                _prune_snapshots(tracked_keys)

                from ..models.dataset import Dataset
                from ..services.dataset_service import DatasetService

                base_dir = os.path.join("./uploads", user.id, "salesforce", connection.id)
                now = datetime.utcnow()
                snapshot_label = now.strftime("%Y%m%dT%H%M%SZ")

                for obj in tracked_objects:
                    try:
                        selected_fields = fields_map.get(obj) if isinstance(fields_map.get(obj), list) else None
                        if not selected_fields:
                            # If UI hasn't set fields yet, we keep it safe but functional
                            selected_fields = ["Id"]

                        if auth_type == "oauth" or oauth_refresh_token:
                            # Use the refreshed access_token/instance_url from above for all objects
                            obj_connector = SalesforceConnector(
                                auth_type="oauth",
                                access_token=creds.get("access_token"),
                                instance_url=creds.get("instance_url"),
                                api_version=creds.get('api_version'),
                                object_name=obj,
                                fields=selected_fields,
                            )
                        else:
                            obj_connector = SalesforceConnector(
                                username=creds.get('username'),
                                password=creds.get('password'),
                                security_token=creds.get('token'),
                                login_domain=creds.get('login_domain') or 'login',
                                api_version=creds.get('api_version'),
                                object_name=obj,
                                fields=selected_fields,
                            )

                        dataset = (
                            db.query(Dataset)
                            .filter(Dataset.connection_id == connection.id, Dataset.source_identifier == obj)
                            .first()
                        )
                        if dataset is None:
                            dataset = Dataset(
                                user_id=user.id,
                                connection_id=connection.id,
                                name=obj,
                                description=f"Salesforce object: {obj}",
                                source_type="salesforce",
                                source_identifier=obj,
                                status="processing",
                            )
                            db.add(dataset)
                            db.commit()
                            db.refresh(dataset)

                        parquet_path = os.path.join(base_dir, obj, "snapshots", snapshot_label, "data.parquet")
                        DatasetService.refresh_dataset_from_connector(dataset, obj_connector, parquet_path, db=db)

                        # Update lightweight snapshot metadata for UI
                        obj_connector.connect()
                        try:
                            schema = obj_connector.get_schema() or {}
                            row_count = schema.get('row_count')
                            df = obj_connector.fetch_data(limit=50, offset=0)
                        finally:
                            obj_connector.disconnect()

                        _upsert_snapshot(
                            sf_database_name,
                            None,
                            obj,
                            schema.get('columns', []),
                            int(row_count) if row_count is not None else None,
                            df.to_dict(orient='records') if df is not None else [],
                        )
                    except Exception:
                        continue

                # Delete snapshots older than retention_days
                cutoff = now - timedelta(days=retention_days)
                ts_re = re.compile(r"^\d{8}T\d{6}Z$")
                for obj in tracked_objects:
                    snapshots_root = os.path.join(base_dir, obj, "snapshots")
                    if not os.path.isdir(snapshots_root):
                        continue
                    for entry in os.listdir(snapshots_root):
                        if not ts_re.match(entry or ""):
                            continue
                        try:
                            dt = datetime.strptime(entry, "%Y%m%dT%H%M%SZ")
                        except Exception:
                            continue
                        if dt < cutoff:
                            shutil.rmtree(os.path.join(snapshots_root, entry), ignore_errors=True)

            # File-based and other connectors: no-op

        except Exception as e:
            connection.test_status = "failed"
            connection.test_message = f"Sync failed: {str(e)}"
            connection.last_tested = datetime.utcnow()
            db.commit()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

        connection.credentials = creds
        db.commit()
        db.refresh(connection)

        return {
            "connection_id": connection.id,
            "source_type": source_type.value if hasattr(source_type, 'value') else str(source_type),
            "success": True,
            "message": connection.test_message or "Synced",
            "changes": changes,
        }

