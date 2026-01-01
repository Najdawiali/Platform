import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Editor, { type OnMount } from "@monaco-editor/react";
import { formatDistanceToNowStrict } from 'date-fns';
import { Database as DatabaseIcon, Folder as FolderIcon, Search as SearchIcon, BarChart2, ChevronDown } from 'lucide-react';

import { connectionService } from '../services/connectionService';
import { datasetService } from '../services/datasetService';
import { queryService } from '../services/queryService';
import { dashboardService } from '../services/dashboardService';
import type { Connection, Dataset } from '../types';
import { SQLVisualizeModal } from '../components/SQLVisualizeModal';
import { savedQueryService, type SavedQueryListItem } from '../services/savedQueryService';

export const SQLEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sqlQuery, setSqlQuery] = useState('');
  const [insightName, setInsightName] = useState('Untitled SQL Insight');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'data_sources' | 'saved_queries'>('data_sources');
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [connectionTables, setConnectionTables] = useState<Record<string, string[]>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, any[]>>({});
  const [syntaxErrors, setSyntaxErrors] = useState<string[]>([]);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isVisualizeOpen, setIsVisualizeOpen] = useState(false);
  const [isVisualizeMenuOpen, setIsVisualizeMenuOpen] = useState(false);
  const [visualizeMode, setVisualizeMode] = useState<'config' | 'sql_direct'>('config');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const HISTORY_STORAGE_KEY = 'sql_editor_history_v1';
  const HISTORY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
  type HistoryItem = { query: string; createdAt: string };
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const [lastExecutedQuery, setLastExecutedQuery] = useState<string>('');
  const [lastExecutedSources, setLastExecutedSources] = useState<any[]>([]);

  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);

  // Memoize the config change handler to prevent infinite re-renders
  const handleVisualizeConfigChange = useCallback((_cfg: any) => {
    // Config tracking moved to visualize modal
  }, []);

  // Track if we should re-run query on pagination changes
  const initialRenderRef = useRef(true);
  const prevPageRef = useRef(currentPage);
  const prevPageSizeRef = useRef(pageSize);

  // Re-run query when page or page size changes (but not on initial render or when query changes)
  useEffect(() => {
    // Skip on initial render
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      prevPageRef.current = currentPage;
      prevPageSizeRef.current = pageSize;
      return;
    }

    // Only re-run if page or pageSize actually changed and we have a previous result
    const pageChanged = prevPageRef.current !== currentPage;
    const pageSizeChanged = prevPageSizeRef.current !== pageSize;
    
    if ((pageChanged || pageSizeChanged) && queryResult && !isExecuting && lastExecutedQuery) {
      // Re-execute the last query with new pagination settings
      handleRunQuery({ page: currentPage });
    }

    // Update refs
    prevPageRef.current = currentPage;
    prevPageSizeRef.current = pageSize;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);
  // This is NOT a real backend connection id and must never hit /api/connections/:id/*.
  const UPLOADED_FILES_GROUP_ID = 'uploaded_files';

  const DS_DEBUG = import.meta.env.VITE_DEBUG_DATASOURCES === 'true';

  const FILE_SOURCE_TYPES = ['csv', 'excel', 'json', 'txt', 'md', 'mdx', 'pdf'] as const;
  // Keep this aligned with DatabasesListPage: only these show as databases.
  const DATABASE_SOURCE_TYPES = ['mysql', 'postgresql', 'mongodb'] as const;

  const isFileSourceType = (t: unknown): boolean =>
    typeof t === 'string' && (FILE_SOURCE_TYPES as readonly string[]).includes(t);
  const isDatabaseSourceType = (t: unknown): boolean =>
    typeof t === 'string' && (DATABASE_SOURCE_TYPES as readonly string[]).includes(t);

  const getConnectionDisplayName = (conn: Connection): string => {
    const raw = (conn as any)?.name;
    if (typeof raw === 'string' && raw.trim() && raw.trim().toLowerCase() !== 'string') {
      return raw;
    }

    const sourceType = (conn as any)?.source_type;
    if (typeof sourceType === 'string' && sourceType.trim()) {
      return sourceType;
    }

    return 'Connection';
  };

  const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase();

  // Saved queries
  const {
    data: savedQueries = [],
    refetch: refetchSavedQueries,
    isLoading: savedQueriesLoading,
  } = useQuery<SavedQueryListItem[]>({
    queryKey: ['saved-queries'],
    queryFn: () => savedQueryService.listSavedQueries(),
    staleTime: 10_000,
  });

  const filteredSavedQueries = savedQueries.filter((q) => {
    const s = normalize(savedSearchQuery);
    if (!s) return true;
    return normalize(q.name).includes(s) || normalize(q.description ?? '').includes(s);
  });

  // Fetch database connections
  const { data: allConnections = [], isLoading: isConnectionsLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
  });

  // IMPORTANT: only show real database connections here (same rule as the Databases page).
  // File-type connections exist in the system but must not appear as databases.
  const connections = allConnections.filter((c) => isDatabaseSourceType((c as any)?.source_type));

  // Fetch file uploads (datasets) - use simplified list for performance
  const { data: datasets = [], isLoading: isDatasetsLoading } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
  });

  // Only show actual uploaded files (datasets created from a file upload).
  // This matches FileUploadsPage and avoids listing DB-synced datasets here.
  const uploadedFileDatasets = datasets.filter((d: any) => !!d?.original_filename);

  const searchActive = normalize(searchQuery).length > 0;
  const searchNorm = normalize(searchQuery);

  // Load and prune history (keep last 3 days)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed: HistoryItem[] = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      const pruned = (Array.isArray(parsed) ? parsed : [])
        .filter((h) => typeof h?.query === 'string' && typeof h?.createdAt === 'string')
        .filter((h) => {
          const t = Date.parse(h.createdAt);
          return Number.isFinite(t) && now - t <= HISTORY_MAX_AGE_MS;
        })
        .slice(0, 250);
      setHistoryItems(pruned);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      setHistoryItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addHistoryItem = (queryText: string) => {
    const q = String(queryText ?? '').trim();
    if (!q) return;
    const nowIso = new Date().toISOString();
    const next: HistoryItem[] = [{ query: q, createdAt: nowIso }, ...historyItems]
      .filter((h, idx, arr) => arr.findIndex((x) => x.query === h.query) === idx)
      .filter((h) => Date.now() - Date.parse(h.createdAt) <= HISTORY_MAX_AGE_MS)
      .slice(0, 250);
    setHistoryItems(next);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  };

  // When searching, proactively load tables for all visible DB connections once.
  // This keeps search useful without spamming endpoints on initial page load.
  useEffect(() => {
    if (!searchActive) return;

    const handle = window.setTimeout(() => {
      const pending = connections.filter((c) => !Object.prototype.hasOwnProperty.call(connectionTables, c.id));
      if (pending.length === 0) return;

      if (DS_DEBUG) console.debug('[DataSources] search active, preloading tables', { pending: pending.map((p) => p.id) });
      Promise.allSettled(pending.map((c) => loadConnectionTables(c.id))).catch(() => {
        // ignore
      });
    }, 250);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchNorm, searchActive, connections, connectionTables, DS_DEBUG]);

  const filteredConnections = connections.filter((conn) => {
    if (!searchActive) return true;
    const nameMatch = normalize(getConnectionDisplayName(conn)).includes(searchNorm);
    const tables = connectionTables[conn.id] || [];
    const tableMatch = tables.some((t) => normalize(t).includes(searchNorm));
    return nameMatch || tableMatch;
  });

  const filteredUploadedDatasets = uploadedFileDatasets.filter((d: any) => {
    if (!searchActive) return true;
    const name = normalize(d?.name);
    const orig = normalize(d?.original_filename);
    return name.includes(searchNorm) || orig.includes(searchNorm);
  });

  useEffect(() => {
    if (!DS_DEBUG) return;
    const countsBySource: Record<string, number> = {};
    for (const c of allConnections as any[]) {
      const st = String(c?.source_type ?? 'unknown');
      countsBySource[st] = (countsBySource[st] || 0) + 1;
    }
    const dbConn = (allConnections as any[]).filter((c) => isDatabaseSourceType(c?.source_type));
    const fileConn = (allConnections as any[]).filter((c) => isFileSourceType(c?.source_type));

    console.groupCollapsed(
      `[DataSources] connections=${allConnections.length} db=${dbConn.length} fileConn=${fileConn.length} datasets=${datasets.length} uploadedFiles=${uploadedFileDatasets.length}`
    );
    console.log('Counts by connection.source_type:', countsBySource);
    console.table(
      dbConn.map((c) => ({ id: c?.id, name: c?.name, source_type: c?.source_type }))
    );
    console.table(
      fileConn.slice(0, 20).map((c) => ({ id: c?.id, name: c?.name, source_type: c?.source_type }))
    );
    console.table(
      (uploadedFileDatasets as any[]).slice(0, 20).map((d) => ({
        id: d?.id,
        name: d?.name,
        original_filename: d?.original_filename,
        row_count: d?.row_count,
        column_count: d?.column_count,
      }))
    );
    console.groupEnd();
  }, [DS_DEBUG, allConnections, datasets, uploadedFileDatasets.length]);

  // Cache for full dataset details (with schema_info)
  const [datasetDetails, setDatasetDetails] = useState<Record<string, any>>({});

  // Fetch full dataset details when needed
  const getDatasetWithSchema = async (datasetId: string): Promise<any> => {
    if (datasetDetails[datasetId]) {
      return datasetDetails[datasetId];
    }
    
    try {
      const fullDataset = await datasetService.getDatasetById(datasetId);
      setDatasetDetails(prev => ({ ...prev, [datasetId]: fullDataset }));
      return fullDataset;
    } catch (error) {
      console.error('Failed to fetch dataset details:', error);
      return null;
    }
  };

  // Load tables for a connection when expanded
  const loadConnectionTables = async (connId: string) => {
    if (connId === UPLOADED_FILES_GROUP_ID) {
      if (DS_DEBUG) console.debug('[DataSources] skip loadConnectionTables for uploaded files group', { connId });
      return;
    }
    if (connectionTables[connId]) return;
    
    try {
      // Primary: /collections (Mongo + some DB connectors)
      try {
        if (DS_DEBUG) console.debug('[DataSources] load tables via /collections', { connId });
        const tables = await connectionService.getCollections(connId);
        setConnectionTables((prev) => ({ ...prev, [connId]: tables }));
        return;
      } catch {
        // Secondary: /databases (SQL-style connectors)
        try {
          if (DS_DEBUG) console.debug('[DataSources] load tables via /databases', { connId });
          const dbs = await connectionService.getDatabases(connId);
          const flattened: string[] = [];
          Object.entries(dbs || {}).forEach(([dbName, tables]) => {
            (tables || []).forEach((t) => flattened.push(`${dbName}.${t}`));
          });
          setConnectionTables((prev) => ({ ...prev, [connId]: flattened }));
          return;
        } catch {
          // This connection likely doesn't expose tables/collections (e.g., file-type connectors).
          setConnectionTables((prev) => ({ ...prev, [connId]: [] }));
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load tables:', err);
      setConnectionTables((prev) => ({ ...prev, [connId]: [] }));
    }
  };

  const [activeMenu, setActiveMenu] = useState<{
    type: 'table';
    connId: string;
    tableName: string;
    isDataset: boolean;
    x: number;
    y: number;
    displayName: string;
  } | null>(null);

  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    data: any;
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    title: '',
    data: null,
    loading: false,
    error: null
  });

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, connId: string, tableName: string, isDataset: boolean, displayName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenu({
      type: 'table',
      connId,
      tableName,
      isDataset,
      x: e.clientX,
      y: e.clientY,
      displayName
    });
  };

  const stripFileExtension = (name: string) => {
    const s = String(name ?? '').trim();
    const lastDot = s.lastIndexOf('.');
    if (lastDot <= 0) return s;
    return s.slice(0, lastDot);
  };

  const fetchPreviewData = async (connId: string, tableName: string, isDataset: boolean, displayName: string) => {
    setPreviewModal({
      isOpen: true,
      title: `Preview: ${displayName}`,
      data: null,
      loading: true,
      error: null
    });

    try {
      let result;
      if (isDataset) {
        // For datasets, we need the ID. tableName passed here is actually the ID for datasets based on how we call it.
        // Wait, let's check how we call it.
        // toggleTable('uploaded_files', dataset.id, true) -> tableName is ID.
        // handleContextMenu(..., dataset.id, true, displayName) -> tableName is ID.
        // So yes, tableName is the dataset ID.
        result = await datasetService.getDatasetPreview(tableName, 100);
      } else {
        // For connections
        let database: string | undefined;
        let collection = tableName;
        const firstDot = tableName.indexOf('.');
        if (firstDot > 0) {
          database = tableName.slice(0, firstDot);
          collection = tableName.slice(firstDot + 1);
        }
        // Fetch 100 rows
        result = await connectionService.queryData(connId, collection, 100, 0, database);
        console.log('[Preview] Raw result:', result);
      }

      setPreviewModal(prev => ({
        ...prev,
        loading: false,
        data: result
      }));
    } catch (err: any) {
      console.error('Preview failed:', err);
      setPreviewModal(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to load preview'
      }));
    }
  };

  const handleMenuAction = async (action: string) => {
    if (!activeMenu) return;
    const { connId, tableName, isDataset, displayName } = activeMenu;

    switch (action) {
      case 'insert':
        insertTableName(
          isDataset ? 'uploaded_files' : getConnectionDisplayName(connections.find(c => c.id === connId)!),
          isDataset ? stripFileExtension(displayName) : tableName
        );
        break;
      case 'preview':
        fetchPreviewData(connId, tableName, isDataset, displayName);
        break;
      case 'copy':
        navigator.clipboard.writeText(displayName);
        break;
      case 'add_columns':
        // Ensure columns are loaded
        const key = `${connId}-${tableName}`;
        if (!tableColumns[key]) {
           await toggleTable(connId, tableName, isDataset);
        }
        
        setTimeout(() => {
            const currentCols = tableColumns[key];
            if (currentCols && currentCols.length > 0) {
                const colString = currentCols.map(c => c.name).join(', ');
                insertAtCursor(colString);
            } else {
                // If not loaded, maybe just insert *
                insertAtCursor('*');
            }
        }, 500);
        break;
    }
    setActiveMenu(null);
  };

  const toggleDbExpansion = (connId: string) => {
    const newExpanded = new Set(expandedDbs);
    if (newExpanded.has(connId)) {
      newExpanded.delete(connId);
    } else {
      newExpanded.add(connId);
      if (connId !== UPLOADED_FILES_GROUP_ID) {
        loadConnectionTables(connId);
      } else if (DS_DEBUG) {
        console.debug('[DataSources] expanded uploaded files group', { connId });
      }
    }
    setExpandedDbs(newExpanded);
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handleEditorChange = (value: string | undefined) => {
    setSqlQuery(value || '');
  };

  const handleValidation = useCallback((_markers: any[]) => {
    // Monaco's built-in validation (if any)
  }, []);

  // Backend validation
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!sqlQuery.trim()) {
        setSyntaxErrors([]);
        if (monacoRef.current && editorRef.current) {
           monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'api-validation', []);
        }
        return;
      }

      try {
        const result = await queryService.validateQuery(sqlQuery);
        setSyntaxErrors(result.errors);

        // Update Monaco markers with backend errors
        if (monacoRef.current && editorRef.current) {
          const model = editorRef.current.getModel();
          const markers = result.errors.map(err => ({
            startLineNumber: 1, // Default to line 1 since backend doesn't return line info yet
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1000,
            message: err,
            severity: monacoRef.current.MarkerSeverity.Error
          }));
          monacoRef.current.editor.setModelMarkers(model, 'api-validation', markers);
        }
      } catch (err) {
        console.error('Validation failed', err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [sqlQuery]);

  const toggleTable = async (connId: string, tableName: string, isDataset: boolean = false) => {
    const key = `${connId}-${tableName}`;
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
      setExpandedTables(newExpanded);
    } else {
      newExpanded.add(key);
      setExpandedTables(newExpanded);
      
      // Fetch columns if not already loaded
      if (!tableColumns[key]) {
        try {
          if (isDataset) {
            // For datasets, try preview API first (works for most files)
            const dataset: any = uploadedFileDatasets.find((ds: any) => ds.id === tableName || ds.name === tableName);
            if (dataset) {
              try {
                // Try preview API first - this works for most datasets
                // Use a larger preview size; some preprocessing steps can fail on a single-row sample.
                // File Uploads / File Detail pages use 20.
                if (DS_DEBUG) console.debug('[DataSources] dataset preview', { datasetId: dataset.id, name: dataset.name, original_filename: dataset.original_filename });
                const preview = await datasetService.getDatasetPreview(dataset.id, 20);
                
                if (preview?.columns && Array.isArray(preview.columns)) {
                  const cols = preview.columns.map((colName: string) => ({
                    name: colName,
                    type: 'string'
                  }));
                  console.log('✓ Fetched', cols.length, 'columns from preview API for:', tableName);
                  setTableColumns((prev) => ({ ...prev, [key]: cols }));
                } else if (preview?.rows && Array.isArray(preview.rows) && preview.rows.length > 0) {
                  // Extract from first row if columns array not provided
                  const firstRow = preview.rows[0];
                  const cols = Object.keys(firstRow).map(key => ({
                    name: key,
                    type: typeof firstRow[key]
                  }));
                  console.log('✓ Extracted', cols.length, 'columns from preview rows for:', tableName);
                  setTableColumns((prev) => ({ ...prev, [key]: cols }));
                }
              } catch (previewError) {
                // Preview API failed - try getting full dataset details
                console.warn('⚠ Preview API failed for:', tableName, '- fetching full dataset details');
                try {
                  const fullDataset = await getDatasetWithSchema(dataset.id);
                  
                  if (fullDataset?.schema_info?.columns && Array.isArray(fullDataset.schema_info.columns)) {
                    const cols = fullDataset.schema_info.columns.map((col: any) => ({
                      name: col.name || col,
                      type: col.type || col.data_type || 'string'
                    }));
                    console.log('✓ Fetched', cols.length, 'columns from dataset details for:', tableName);
                    setTableColumns((prev) => ({ ...prev, [key]: cols }));
                  } else if (fullDataset?.column_count && fullDataset.column_count > 0) {
                    // Last resort: create placeholder columns
                    const cols = Array.from({ length: fullDataset.column_count }, (_, i) => ({
                      name: `column_${i + 1}`,
                      type: 'unknown'
                    }));
                    console.log('⚠ Created', cols.length, 'placeholder columns for:', tableName);
                    setTableColumns((prev) => ({ ...prev, [key]: cols }));
                  } else {
                    console.warn('✗ No schema available for:', tableName);
                    setTableColumns((prev) => ({ ...prev, [key]: [] }));
                  }
                } catch (detailError) {
                  console.error('✗ Failed to fetch dataset details for:', tableName, detailError);
                  setTableColumns((prev) => ({ ...prev, [key]: [] }));
                }
              }
            }
          } else {
            // For database connections, fetch from the database
            let database: string | undefined;
            let collection = tableName;
            // If tableName came from /databases flattening, it will be "db.table".
            // Pass db separately so the backend can resolve it.
            const firstDot = tableName.indexOf('.');
            if (firstDot > 0) {
              database = tableName.slice(0, firstDot);
              collection = tableName.slice(firstDot + 1);
            }

            const result = await connectionService.queryData(connId, collection, 1, 0, database);
            if (result?.data?.length > 0) {
              const cols = Object.keys(result.data[0]).map((colName) => ({
                name: colName,
                type: typeof result.data[0][colName],
              }));
              setTableColumns((prev) => ({ ...prev, [key]: cols }));
            } else if (result?.columns) {
              setTableColumns((prev) => ({ ...prev, [key]: result.columns }));
            } else {
              setTableColumns((prev) => ({ ...prev, [key]: [] }));
            }
          }
        } catch (err) {
          console.error('Failed to fetch columns:', err);
          // Set empty array on error so it doesn't keep retrying
          setTableColumns((prev) => ({ ...prev, [key]: [] }));
        }
      }
    }
  };

  const handleRunQuery = async (options?: { page?: number; resetPage?: boolean; queryOverride?: string }) => {
    let queryToRun = options?.queryOverride || sqlQuery;
    if (!queryToRun.trim()) return;

    const resetPage = options?.resetPage === true;
    const requestedPage = options?.page ?? currentPage;
    const pageToRun = resetPage ? 1 : requestedPage;
    
    setIsExecuting(true);
    setExecutionError(null);
    setQueryResult(null);
    if (resetPage && currentPage !== 1) {
      // Reset to first page only when explicitly requested (e.g., user clicks Run Query).
      // Do not reset during pagination navigation.
      setCurrentPage(1);
    }

    try {
      // Determine which query to run
      // If override is provided, use it directly. Otherwise check editor selection.
      if (!options?.queryOverride && editorRef.current) {
        const editor = editorRef.current;
        const selection = editor.getSelection();
        const model = editor.getModel();
        
        // 1. Check if there is a text selection
        if (selection && !selection.isEmpty()) {
          queryToRun = model.getValueInRange(selection);
        } else {
          // 2. No selection: find the statement at cursor
          const position = editor.getPosition();
          const fullText = model.getValue();
          const offset = model.getOffsetAt(position);
          
          // Simple split by semicolon
          // Note: This is naive and will break on semicolons inside strings.
          // For a robust solution, we'd need a lexer. But for now, let's assume standard usage.
          const statements = fullText.split(';');
          
          let currentOffset = 0;
          let foundStatement = null;
          
          for (const stmt of statements) {
            const stmtLen = stmt.length + 1; // +1 for the semicolon (or end of string)
            if (offset >= currentOffset && offset < currentOffset + stmtLen) {
              foundStatement = stmt;
              break;
            }
            currentOffset += stmtLen;
          }
          
          if (foundStatement && foundStatement.trim()) {
            queryToRun = foundStatement;
          }
        }
      }

      console.log('Running query:', queryToRun);

      // 1. Extract sources from query
      // Strategy: Find all "schema.table" patterns
      // We support:
      // 1. connection_name.table_name
      // 2. uploaded_files.file_name
      
      const sources: any[] = [];

      // Handle quoted uploaded_files references (already-valid SQL)
      // Example: uploaded_files."sample-employees.txt"
      const uploadedFileQuoted = /uploaded_files\."([^"]+)"/gi;
      const uploadedFileQuotedMatches = [...queryToRun.matchAll(uploadedFileQuoted)];
      if (uploadedFileQuotedMatches.length > 0) {
        for (const m of uploadedFileQuotedMatches) {
          const fullName = String(m[1] ?? '').trim();
          if (!fullName) continue;

          const dataset = uploadedFileDatasets.find((ds: any) => {
            const name = ds.original_filename || ds.name;
            const normName = normalize(name);
            const normToken = normalize(fullName);
            // If the token includes an extension, match exact.
            // If it doesn't, allow matching base name (e.g. "orders" matches "orders.csv").
            if (normToken.includes('.')) return normName === normToken;
            return normName === normToken || normName.startsWith(normToken + '.');
          });

          if (dataset) {
            const alias = `uploaded_files.${fullName}`.toLowerCase();
            if (!sources.some((s) => s.alias === alias)) {
              sources.push({
                alias,
                type: 'dataset',
                id: dataset.id,
              });
            }
          }
        }
      }

      // Rewrite uploaded_files references that include file extensions and/or hyphens
      // Example: uploaded_files.sample-employees.txt -> uploaded_files."sample-employees.txt"
      // This makes the query valid SQL and also matches the backend view name.
      const uploadedFileTokenWithExt = /uploaded_files\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)/gi;
      const uploadedFileMatches = [...queryToRun.matchAll(uploadedFileTokenWithExt)];
      if (uploadedFileMatches.length > 0) {
        for (const m of uploadedFileMatches) {
          const fullName = String(m[1] ?? '').trim();
          if (!fullName) continue;

          const dataset = uploadedFileDatasets.find((ds: any) => {
            const name = ds.original_filename || ds.name;
            return normalize(name) === normalize(fullName);
          });

          if (dataset) {
            const alias = `uploaded_files.${fullName}`.toLowerCase();
            if (!sources.some((s) => s.alias === alias)) {
              sources.push({
                alias,
                type: 'dataset',
                id: dataset.id,
              });
            }

            // Replace the unquoted token with quoted table name
            const rawToken = `uploaded_files.${fullName}`;
            const escapedFullName = fullName.replaceAll('"', '""');
            const replacement = `uploaded_files."${escapedFullName}"`;
            const tokenPattern = new RegExp(rawToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            queryToRun = queryToRun.replace(tokenPattern, replacement);
          }
        }
      }
      
      // Debugging
      if (DS_DEBUG) {
        console.log('Available connections:', connections.map(c => ({ id: c.id, name: getConnectionDisplayName(c) })));
      }

      // Regex to find "word.word" (simple identifiers)
      // This matches "postgresql.orders", "mysql_db.users", etc.
      const pattern = /([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/g;
      const matches = [...queryToRun.matchAll(pattern)];
      
      for (const m of matches) {
        const schema = m[1];
        const table = m[2];
        
        // Check if schema matches a connection (case-insensitive)
        const connection = connections.find(c => 
            getConnectionDisplayName(c).toLowerCase() === schema.toLowerCase()
        );
        
        if (connection) {
            // Avoid duplicates
            const alias = `${schema.toLowerCase()}.${table.toLowerCase()}`;
            if (!sources.some(s => s.alias === alias)) {
                sources.push({
                    alias: alias,
                    type: 'connection',
                    id: connection.id,
                    source_identifier: table
                });
            }
        } else if (schema.toLowerCase() === 'uploaded_files') {
            // Check uploaded files (unextended token form: uploaded_files.orders)
            // Note: extended forms (uploaded_files.foo.txt) are handled above and rewritten.
            const dataset = uploadedFileDatasets.find((ds: any) => {
              const name = ds.original_filename || ds.name;
              const normName = normalize(name);
              const normTable = normalize(table);
              // Match exact name OR name without extension
              return normName === normTable || normName.startsWith(normTable + '.');
            });

            if (dataset) {
              const alias = `uploaded_files.${table}`.toLowerCase();
              if (!sources.some((s) => s.alias === alias)) {
                sources.push({
                  alias,
                  type: 'dataset',
                  id: dataset.id,
                });
              }
            }
        }
      }

      console.log('Executing query with sources:', sources);

      if (sources.length === 0) {
        // Fallback: If no sources found via regex, maybe the user is using a connection name that has spaces?
        // Or maybe they are querying a table directly without schema (not supported yet)?
        // Let's try to be helpful.
        console.warn('No sources detected in query. Ensure you are using "ConnectionName.TableName" syntax.');
      }

      const result = await queryService.executeQuery({
        query: queryToRun,
        sources: sources,
        page: pageToRun,
        page_size: pageSize
      });
      setLastExecutedQuery(queryToRun);
      setLastExecutedSources(sources);

      setQueryResult(result);
      addHistoryItem(queryToRun);
    } catch (err: any) {
      console.error('Query execution failed:', err);
      setExecutionError(err.response?.data?.detail || err.message || 'Query execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const [initialVisualizeConfig, setInitialVisualizeConfig] = useState<Record<string, any> | undefined>(undefined);
  const lastLoadedChartId = useRef<string | null>(null);

  // Handle loading saved insight for editing
  useEffect(() => {
    const editDashboardId = searchParams.get('dashboardId');
    const editChartId = searchParams.get('chartId');

    // Reset loaded state if we navigate away from edit mode
    if (!editChartId) {
      lastLoadedChartId.current = null;
      return;
    }

    // Wait for dependencies to load so source resolution works
    if (isConnectionsLoading || isDatasetsLoading) return;

    // Prevent double-loading the same chart
    if (lastLoadedChartId.current === editChartId) return;

    if (editDashboardId && editChartId) {
      const loadInsight = async () => {
        try {
          lastLoadedChartId.current = editChartId;
          const dashboard = await dashboardService.getDashboard(editDashboardId);
          const chart = dashboard.charts.find((c: any) => c.id === editChartId);
          
          if (chart && chart.config && chart.config.sql_query) {
             const query = chart.config.sql_query;
             setSqlQuery(query);
             setInsightName(dashboard.name);
             
             // Restore mode
             if (chart.config.mode === 'sql_direct') {
                setVisualizeMode('sql_direct');
             } else {
                setVisualizeMode('config');
             }

             // Set initial config for the modal to restore state
             setInitialVisualizeConfig({
               ...chart.config,
               insightName: dashboard.name,
               insightDescription: dashboard.description,
               editDashboardId: editDashboardId,
               editChartId: editChartId
             });

             // Run the query and open modal
             // We need to wait for the query to execute and state to update.
             // handleRunQuery is async and waits for queryService.executeQuery.
             await handleRunQuery({ queryOverride: query, resetPage: true });
             
             // Ensure the modal opens only after we have attempted to run the query.
             // The modal will use the queryResult state which is set in handleRunQuery.
             setIsVisualizeOpen(true);
          }
        } catch (err) {
          console.error("Failed to load insight", err);
          lastLoadedChartId.current = null; // Allow retry on failure?
        }
      };
      loadInsight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isConnectionsLoading, isDatasetsLoading]);

  const handleLoadSavedQuery = async (id: string) => {
    try {
      const detail = await savedQueryService.getSavedQuery(id);
      setSqlQuery(detail.query || '');
      setSidebarTab('data_sources');
    } catch {
      // ignore
    }
  };

  const handleDeleteSavedQuery = async (id: string) => {
    try {
      await savedQueryService.deleteSavedQuery(id);
      await refetchSavedQueries();
    } catch {
      // ignore
    }
  };

  const clearHistory = () => {
    setHistoryItems([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const insertAtCursor = (text: string) => {
    if (editorRef.current) {
      const editor = editorRef.current;
      const selection = editor.getSelection();
      const op = { range: selection, text: text, forceMoveMarkers: true };
      editor.executeEdits("my-source", [op]);
      editor.focus();
    } else {
      setSqlQuery((prev) => prev + text);
    }
  };

  const escapeIdentifier = (ident: string) => String(ident ?? '').replaceAll('"', '""');

  const insertTableName = (dbName: string, tableName: string) => {
    if (normalize(dbName) === 'uploaded_files') {
      const base = stripFileExtension(tableName);
      insertAtCursor(`uploaded_files."${escapeIdentifier(base)}"`);
      return;
    }
    insertAtCursor(`${dbName}.${tableName}`);
  };

  const insertColumnName = (dbName: string, tableName: string, columnName: string) => {
    if (normalize(dbName) === 'uploaded_files') {
      const base = stripFileExtension(tableName);
      insertAtCursor(`uploaded_files."${escapeIdentifier(base)}".${columnName}`);
      return;
    }
    insertAtCursor(`${dbName}.${tableName}.${columnName}`);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Left Sidebar - Database Connections */}
      <div
        style={{
          width: '280px',
          backgroundColor: 'white',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => setSidebarTab('data_sources')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: sidebarTab === 'data_sources' ? 900 : 700,
                color: sidebarTab === 'data_sources' ? '#0f172a' : '#64748b',
                borderBottom: sidebarTab === 'data_sources' ? '2px solid #4f46e5' : '2px solid transparent',
              }}
            >
              Data Sources
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('saved_queries')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: sidebarTab === 'saved_queries' ? 900 : 700,
                color: sidebarTab === 'saved_queries' ? '#0f172a' : '#64748b',
                borderBottom: sidebarTab === 'saved_queries' ? '2px solid #4f46e5' : '2px solid transparent',
              }}
            >
              Saved Queries
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                backgroundColor: 'white',
              }}
            >
              <SearchIcon size={14} color="#64748b" />
              <input
                value={sidebarTab === 'data_sources' ? searchQuery : savedSearchQuery}
                onChange={(e) => (sidebarTab === 'data_sources' ? setSearchQuery(e.target.value) : setSavedSearchQuery(e.target.value))}
                placeholder={sidebarTab === 'data_sources' ? 'Search databases or tables' : 'Search queries...'}
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '12px',
                  color: '#0f172a',
                  background: 'transparent',
                }}
              />
            </div>
          </div>
        </div>

        {sidebarTab === 'saved_queries' ? (
          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {savedQueriesLoading ? (
              <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>Loading saved queries...</div>
            ) : filteredSavedQueries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: '12px' }}>
                No saved queries
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredSavedQueries.map((q) => (
                  <div
                    key={q.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLoadSavedQuery(q.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleLoadSavedQuery(q.id);
                    }}
                    style={{
                      padding: '12px 12px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', marginBottom: '2px' }}>{q.name}</div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSavedQuery(q.id);
                        }}
                        style={{
                          border: '1px solid #e2e8f0',
                          backgroundColor: 'white',
                          color: '#475569',
                          fontSize: '12px',
                          fontWeight: 800,
                          borderRadius: '10px',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    {q.description && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.description}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>🕒 {new Date(q.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
              {filteredConnections.length === 0 && filteredUploadedDatasets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: '12px' }}>
                  No data sources available
                </div>
              ) : (
                <>
                  {/* Database Connections */}
                  {filteredConnections.map((conn) => (
              <div key={conn.id} style={{ marginBottom: '8px' }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleDbExpansion(conn.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleDbExpansion(conn.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#0f172a',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <DatabaseIcon size={16} color="#64748b" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getConnectionDisplayName(conn)}
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>
                    {expandedDbs.has(conn.id) ? '▼' : '▶'}
                  </span>
                </div>

                {(expandedDbs.has(conn.id) || (searchActive && (connectionTables[conn.id] || []).some((t) => normalize(t).includes(searchNorm)))) && (
                  <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, padding: '6px 8px' }}>
                      TABLES
                    </div>
                    {connectionTables[conn.id] && connectionTables[conn.id].length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8' }}>
                        No tables available
                      </div>
                    ) : connectionTables[conn.id] ? (connectionTables[conn.id]
                      .filter((t) => !searchActive || normalize(t).includes(searchNorm))
                      .map((table) => {
                      const tableKey = `${conn.id}-${table}`;
                      const isTableExpanded = expandedTables.has(tableKey);
                      const columns = tableColumns[tableKey] || [];
                      const columnsLoaded = Object.prototype.hasOwnProperty.call(tableColumns, tableKey);
                      const connDisplayName = getConnectionDisplayName(conn);

                      return (
                        <div key={table}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleTable(conn.id, table)}
                            onDoubleClick={() => insertTableName(connDisplayName, table)}
                            onContextMenu={(e) => handleContextMenu(e, conn.id, table, false, table)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') toggleTable(conn.id, table);
                            }}
                            style={{
                              padding: '8px 12px',
                              fontSize: '12px',
                              color: '#475569',
                              cursor: 'pointer',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between', // Changed to space-between for ... button
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f1f5f9';
                              // Show the ... button on hover
                              const moreBtn = e.currentTarget.querySelector('.more-btn') as HTMLElement;
                              if (moreBtn) moreBtn.style.opacity = '1';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              const moreBtn = e.currentTarget.querySelector('.more-btn') as HTMLElement;
                              if (moreBtn) moreBtn.style.opacity = '0';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '10px' }}>{isTableExpanded ? '▼' : '▶'}</span>
                                <span style={{ fontSize: '12px' }}>📋</span>
                                <span>{table}</span>
                            </div>
                            <div 
                                className="more-btn"
                                onClick={(e) => handleContextMenu(e, conn.id, table, false, table)}
                                style={{ 
                                    opacity: 0, 
                                    transition: 'opacity 0.2s',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    color: '#94a3b8',
                                    fontWeight: 'bold'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                •••
                            </div>
                          </div>

                          {isTableExpanded && (
                            <div style={{ marginLeft: '16px' }}>
                              {columns.length > 0 ? (
                                columns.map((col: any) => (
                                  <div
                                    key={col.name}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => insertColumnName(connDisplayName, table, String(col.name))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        insertColumnName(connDisplayName, table, String(col.name));
                                      }
                                    }}
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '11px',
                                      color: '#64748b',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      cursor: 'pointer',
                                      borderRadius: '8px',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#f1f5f9';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                  >
                                    <span style={{ fontSize: '8px', color: '#94a3b8' }}>●</span>
                                    <span>{col.name}</span>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                                      {col.type ? `(${col.type})` : ''}
                                    </span>
                                  </div>
                                ))
                              ) : columnsLoaded ? (
                                <div style={{ padding: '6px 12px', fontSize: '11px', color: '#94a3b8' }}>
                                  No columns available
                                </div>
                              ) : (
                                <div style={{ padding: '6px 12px', fontSize: '11px', color: '#94a3b8' }}>
                                  Loading columns...
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })) : (
                      <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8' }}>
                        Loading tables...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

              {/* Uploaded Files as a database */}
              {filteredUploadedDatasets.length > 0 && (
                <div style={{ marginTop: connections.length > 0 ? '8px' : '0', marginBottom: '8px' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleDbExpansion('uploaded_files')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggleDbExpansion('uploaded_files');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#0f172a',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <FolderIcon size={16} color="#64748b" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Uploaded Files
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>
                      {(expandedDbs.has('uploaded_files') || searchActive) ? '▼' : '▶'}
                    </span>
                  </div>

                  {(expandedDbs.has('uploaded_files') || searchActive) && (
                    <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, padding: '6px 8px' }}>
                        FILES
                      </div>
                      {filteredUploadedDatasets.map((dataset: any) => {
                        const tableKey = `uploaded_files-${dataset.id}`;
                        const isTableExpanded = expandedTables.has(tableKey);
                        const columns = tableColumns[tableKey] || [];
                        const columnsLoaded = Object.prototype.hasOwnProperty.call(tableColumns, tableKey);
                        const displayName = dataset.original_filename || dataset.name;
                        const insertName = stripFileExtension(displayName);

                        return (
                          <div key={dataset.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleTable('uploaded_files', dataset.id, true)}
                              onDoubleClick={() => insertTableName('uploaded_files', insertName)}
                              onContextMenu={(e) => handleContextMenu(e, 'uploaded_files', dataset.id, true, displayName)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') toggleTable('uploaded_files', dataset.id, true);
                              }}
                              style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                color: '#475569',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f1f5f9';
                                const moreBtn = e.currentTarget.querySelector('.more-btn') as HTMLElement;
                                if (moreBtn) moreBtn.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                const moreBtn = e.currentTarget.querySelector('.more-btn') as HTMLElement;
                                if (moreBtn) moreBtn.style.opacity = '0';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <span style={{ fontSize: '10px' }}>{isTableExpanded ? '▼' : '▶'}</span>
                                <span style={{ fontSize: '12px' }}>📄</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                              </div>
                              <div 
                                className="more-btn"
                                onClick={(e) => handleContextMenu(e, 'uploaded_files', dataset.id, true, displayName)}
                                style={{ 
                                    opacity: 0, 
                                    transition: 'opacity 0.2s',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    color: '#94a3b8',
                                    fontWeight: 'bold',
                                    flexShrink: 0
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                •••
                            </div>
                            </div>

                            {isTableExpanded && (
                              <div style={{ marginLeft: '16px' }}>
                                {columns.length > 0 ? (
                                  columns.map((col: any) => (
                                    <div
                                      key={col.name}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => insertColumnName('uploaded_files', insertName, String(col.name))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          insertColumnName('uploaded_files', insertName, String(col.name));
                                        }
                                      }}
                                      style={{
                                        padding: '6px 12px',
                                        fontSize: '11px',
                                        color: '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f1f5f9';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                      }}
                                    >
                                      <span style={{ fontSize: '8px', color: '#94a3b8' }}>●</span>
                                      <span>{col.name}</span>
                                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                                        {col.type ? `(${col.type})` : ''}
                                      </span>
                                    </div>
                                  ))
                                ) : columnsLoaded ? (
                                  <div style={{ padding: '6px 12px', fontSize: '11px', color: '#94a3b8' }}>
                                    No columns available
                                  </div>
                                ) : (
                                  <div style={{ padding: '6px 12px', fontSize: '11px', color: '#94a3b8' }}>
                                    Loading columns...
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>

            {/* History (last 3 days) */}
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 12px', backgroundColor: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b' }}>HISTORY (LAST 3 DAYS)</div>
                <button
                  type="button"
                  onClick={() => setIsClearHistoryConfirmOpen(true)}
                  disabled={historyItems.length === 0}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: historyItems.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 900,
                    color: historyItems.length === 0 ? '#cbd5e1' : '#4f46e5',
                  }}
                >
                  Clear
                </button>
              </div>
              <div style={{ maxHeight: '220px', overflow: 'auto' }}>
                {historyItems.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>No recent history</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {historyItems.map((h, idx) => (
                      <div
                        key={`${h.createdAt}-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSqlQuery(h.query)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSqlQuery(h.query);
                        }}
                        style={{
                          padding: '10px 10px',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                      >
                        <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.query}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                          🕒 {formatDistanceToNowStrict(new Date(h.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <div
          style={{
            backgroundColor: 'white',
            borderBottom: '1px solid #e2e8f0',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/insights/create')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4f46e5',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              ← Back
            </button>
            <div style={{ width: '1px', height: '16px', backgroundColor: '#e2e8f0' }} />
            <input
              value={insightName}
              onChange={(e) => setInsightName(e.target.value)}
              placeholder="Untitled SQL Insight"
              style={{
                fontSize: '14px',
                fontWeight: 900,
                color: '#0f172a',
                border: '1px solid transparent',
                borderRadius: '8px',
                padding: '6px 8px',
                outline: 'none',
                backgroundColor: 'transparent',
                minWidth: '240px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#c7d2fe';
                e.currentTarget.style.backgroundColor = '#eef2ff';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.backgroundColor = 'transparent';
                const trimmed = e.currentTarget.value.trim();
                setInsightName(trimmed || 'Untitled SQL Insight');
              }}
              aria-label="Insight name"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => handleRunQuery({ page: 1, resetPage: true })}
              disabled={isExecuting}
              style={{
                padding: '10px 20px',
                backgroundColor: 'white',
                color: isExecuting ? '#94a3b8' : '#0f172a',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isExecuting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isExecuting ? 'Running...' : '▶ Run Query'}
            </button>
            
            <button
              onClick={async () => {
                if (!sqlQuery.trim()) {
                  alert('Please enter a SQL query to save');
                  return;
                }
                
                const queryName = prompt('Enter a name for this query:', insightName || 'Untitled Query');
                if (!queryName) return;
                
                const queryDescription = prompt('Enter a description (optional):', '');
                
                try {
                  await savedQueryService.createSavedQuery({
                    name: queryName,
                    description: queryDescription || undefined,
                    query: sqlQuery
                  });
                  alert('Query saved successfully!');
                  // Refresh saved queries list
                  window.location.reload();
                } catch (error: any) {
                  alert(`Failed to save query: ${error.response?.data?.detail || error.message}`);
                }
              }}
              disabled={!sqlQuery.trim()}
              style={{
                padding: '10px 20px',
                backgroundColor: sqlQuery.trim() ? '#10b981' : '#e2e8f0',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: sqlQuery.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              💾 Save Query
            </button>
          </div>
        </div>

        {/* SQL Editor Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div
            style={{
              flex: 1,
              padding: '16px 24px',
              overflow: 'auto',
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px' }}>
                SQL QUERY
              </div>
              <div style={{ 
                border: syntaxErrors.length > 0 ? '1px solid #ef4444' : '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                backgroundColor: 'white'
              }}>
                <Editor
                  height="400px"
                  defaultLanguage="sql"
                  value={sqlQuery}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  onValidate={handleValidation}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 },
                    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                  }}
                />
              </div>
              {syntaxErrors.length > 0 && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                  }}
                >
                  {syntaxErrors.map((error, idx) => (
                    <div key={idx} style={{ fontSize: '11px', color: '#dc2626', marginBottom: idx < syntaxErrors.length - 1 ? '4px' : 0 }}>
                      ⚠️ {error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Results Section */}
          <div
            style={{
              borderTop: '1px solid #e2e8f0',
              backgroundColor: 'white',
              padding: '0',
              display: 'flex',
              flexDirection: 'column',
              height: '400px', // Fixed height for results area
            }}
          >
            <div style={{ 
              padding: '12px 24px', 
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>
                RESULTS 
                {queryResult && (
                  <span style={{ fontWeight: 400, marginLeft: '8px' }}>
                    • {queryResult.row_count.toLocaleString()} rows • {Math.round(queryResult.execution_time_ms)}ms
                    {queryResult.total_pages > 1 && (
                      <span> • Page {queryResult.page} of {queryResult.total_pages}</span>
                    )}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!queryResult) return;
                      setIsVisualizeMenuOpen(!isVisualizeMenuOpen);
                    }}
                    disabled={!queryResult}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: queryResult ? '#4f46e5' : '#f1f5f9',
                      color: queryResult ? 'white' : '#94a3b8',
                      border: queryResult ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: queryResult ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      if (!queryResult) return;
                      e.currentTarget.style.backgroundColor = '#4338ca';
                    }}
                    onMouseLeave={(e) => {
                      if (!queryResult) return;
                      e.currentTarget.style.backgroundColor = '#4f46e5';
                    }}
                    title="Visualize Results"
                  >
                    <BarChart2 size={16} />
                    <ChevronDown size={12} />
                  </button>
                  
                  {isVisualizeMenuOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                      zIndex: 50,
                      minWidth: '160px',
                      overflow: 'hidden'
                    }}>
                      <button
                        onClick={() => {
                          setVisualizeMode('sql_direct');
                          setIsVisualizeOpen(true);
                          setIsVisualizeMenuOpen(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: '#1e293b',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        Visualize
                      </button>
                      <button
                        onClick={() => {
                          setVisualizeMode('config');
                          setIsVisualizeOpen(true);
                          setIsVisualizeMenuOpen(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: '#1e293b',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        Visualize with config
                      </button>
                    </div>
                  )}
                </div>

                {queryResult?.total_pages > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPage > 1) {
                          setCurrentPage(currentPage - 1);
                        }
                      }}
                      disabled={currentPage === 1}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: currentPage === 1 ? '#f1f5f9' : 'white',
                        color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ◀ Previous
                    </button>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Page {currentPage} of {queryResult.total_pages}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPage < queryResult.total_pages) {
                          setCurrentPage(currentPage + 1);
                        }
                      }}
                      disabled={currentPage === queryResult.total_pages}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: currentPage === queryResult.total_pages ? '#f1f5f9' : 'white',
                        color: currentPage === queryResult.total_pages ? '#94a3b8' : '#0f172a',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: currentPage === queryResult.total_pages ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Next ▶
                    </button>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1); // Reset to first page
                      }}
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#0f172a',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={50}>50/page</option>
                      <option value={100}>100/page</option>
                      <option value={250}>250/page</option>
                      <option value={500}>500/page</option>
                    </select>
                  </>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              {isExecuting ? (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '100%', 
                  color: '#64748b',
                  fontSize: '13px'
                }}>
                  Running query...
                </div>
              ) : executionError ? (
                <div style={{ 
                  padding: '24px', 
                  color: '#dc2626', 
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace'
                }}>
                  Error: {executionError}
                </div>
              ) : queryResult ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
                    <tr>
                      <th style={{ 
                          textAlign: 'center', 
                          padding: '12px 16px', 
                          borderBottom: '2px solid #e2e8f0',
                          color: '#475569',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          backgroundColor: '#f8fafc',
                          width: '40px'
                        }}>
                        #
                      </th>
                      {queryResult.columns.map((col: string) => (
                        <th key={col} style={{ 
                          textAlign: 'left', 
                          padding: '12px 16px', 
                          borderBottom: '2px solid #e2e8f0',
                          color: '#475569',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          backgroundColor: '#f8fafc'
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row: any, i: number) => {
                      const rowNumber = (currentPage - 1) * pageSize + i + 1;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ 
                              padding: '8px 16px', 
                              color: '#94a3b8',
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: '#f8fafc'
                            }}>
                              {rowNumber}
                          </td>
                          {queryResult.columns.map((col: string) => (
                            <td key={col} style={{ 
                              padding: '8px 16px', 
                              color: '#334155',
                              whiteSpace: 'nowrap',
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {row[col] === null ? <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>null</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '12px',
                  }}
                >
                  Run your query to see results here
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SQLVisualizeModal
        isOpen={isVisualizeOpen}
        onClose={() => {
          setIsVisualizeOpen(false);
          setInitialVisualizeConfig(undefined);
        }}
        page={queryResult?.page ?? currentPage ?? 1}
        totalPages={queryResult?.total_pages ?? 1}
        columns={queryResult?.columns ?? []}
        rows={queryResult?.rows ?? []}
        query={lastExecutedQuery}
        sources={lastExecutedSources}
        onConfigChange={handleVisualizeConfigChange}
        onSaveSuccess={() => {
          refetchSavedQueries();
          setInitialVisualizeConfig(undefined);
        }}
        mode={visualizeMode}
        initialConfig={initialVisualizeConfig}
      />

      {/* Clear History Confirmation */}
      {isClearHistoryConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 3100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setIsClearHistoryConfirmOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 95vw)',
              backgroundColor: 'white',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f8fafc',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>Clear History</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>This will remove your query history from the last 3 days.</div>
              </div>
              <button
                type="button"
                onClick={() => setIsClearHistoryConfirmOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '18px',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                Are you sure you want to clear history?
              </div>
            </div>

            <div
              style={{
                padding: '14px 16px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                backgroundColor: 'white',
              }}
            >
              <button
                type="button"
                onClick={() => setIsClearHistoryConfirmOpen(false)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setIsClearHistoryConfirmOpen(false);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: '#4f46e5',
                  fontSize: '13px',
                  fontWeight: 900,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Context Menu */}
      {activeMenu && (
        <div
          style={{
            position: 'fixed',
            top: activeMenu.y,
            left: activeMenu.x,
            backgroundColor: '#1e293b',
            color: 'white',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 1000,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            minWidth: '180px',
            fontSize: '13px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            onClick={() => handleMenuAction('insert')}
            style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>↳</span> Place name in editor
          </div>
          <div 
            onClick={() => handleMenuAction('preview')}
            style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>👁</span> Preview table
          </div>
          <div 
            onClick={() => handleMenuAction('copy')}
            style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>📋</span> Copy name
          </div>
          <div 
            onClick={() => handleMenuAction('add_columns')}
            style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>[+]</span> Add columns in editor
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '80%',
            maxWidth: '1000px',
            height: '80%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {previewModal.title}
              </h3>
              <button
                onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              {previewModal.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                  Loading preview...
                </div>
              ) : previewModal.error ? (
                <div style={{ padding: '24px', color: '#dc2626' }}>
                  Error: {previewModal.error}
                </div>
              ) : previewModal.data ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 10 }}>
                    <tr>
                      {(previewModal.data.columns || []).map((col: any) => (
                        <th key={col.name || col} style={{
                          textAlign: 'left',
                          padding: '12px 16px',
                          borderBottom: '2px solid #e2e8f0',
                          color: '#475569',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}>
                          {col.name || col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(previewModal.data.rows || []).map((row: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {(previewModal.data.columns || []).map((col: any) => {
                          const colName = col.name || col;
                          return (
                            <td key={colName} style={{
                              padding: '8px 16px',
                              color: '#334155',
                              whiteSpace: 'nowrap',
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {row[colName] === null ? <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>null</span> : String(row[colName])}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                  No data available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
