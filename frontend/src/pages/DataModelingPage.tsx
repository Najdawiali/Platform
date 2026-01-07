import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { datasetService } from '../services/datasetService';
import { connectionService } from '../services/connectionService';
import type { Connection, Dataset } from '../types';
import { TransformationConfigModal } from '../components/TransformationConfigModal';

// ============================================================================
// TYPES
// ============================================================================

interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
  distinctCount?: number;
  nullPercent?: number;
}

interface TableNode {
  id: string;
  type: 'dataset' | 'database_table' | 'derived' | 'transformation';
  name: string;
  source?: string;
  columns: ColumnInfo[];
  isExpanded: boolean;
  x: number;
  y: number;
  rowCount?: number;
  lastSynced?: string;
  connectionId?: string;
  tableName?: string;
  scrollTop?: number;
  transformationType?: string;
  transformationCategory?: string;
  transformationConfig?: any;
  isConfigured?: boolean;
  joinMetadata?: {
    joinType: string;
    leftTable: string;
    rightTable: string;
    leftColumn: string;
    rightColumn: string;
    filter?: string;
    transform?: string;
  };
}

interface JoinRelationship {
  id: string;
  fromTableId: string;
  fromColumnName: string;
  toTableId: string;
  toColumnName: string;
  joinType: 'inner' | 'left' | 'right' | 'full';
  filterCondition?: string;
  transformations?: string;
}

interface DragSource {
  id: string;
  name: string;
  type: 'dataset' | 'database_table' | 'transformation';
  connectionId?: string;
  sourceName?: string;
  category?: string;
  operation?: string;
}

interface DrawingState {
  fromTableId: string;
  fromColumnName: string;
  startX: number;
  startY: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

const isValidName = (name: any): boolean => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Filter out placeholder names
  if (trimmed.toLowerCase() === 'string') return false;
  return true;
};

const sanitizeName = (name: string): string => name.trim();

const extractColumnsFromDataset = (ds: any): ColumnInfo[] => {
  const cols = ds?.schema_info?.schema?.columns || ds?.schema_info?.columns || ds?.columns || [];
  if (!Array.isArray(cols)) return [];

  return cols
    .map((col: any) => {
      let name = '';
      let type = 'string';

      if (typeof col === 'string') {
        name = col;
      } else if (col && typeof col === 'object') {
        name = col.name || '';
        type = col.type || 'string';
      }

      return { name: sanitizeName(name), type };
    })
    .filter((col: any) => isValidName(col.name));
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DataModelingPage: React.FC = () => {
  console.log('Rendering DataModelingPage - checking styles');
  const location = useLocation();
  const navigate = useNavigate();

  // ========== Constants ==========
  const FILE_SOURCE_TYPES = ['csv', 'excel', 'json', 'txt', 'md', 'mdx', 'pdf'] as const;
  const DATABASE_SOURCE_TYPES = ['mysql', 'postgresql', 'mongodb', 'salesforce'] as const;

  const isFileSourceType = (t: unknown): boolean =>
    typeof t === 'string' && (FILE_SOURCE_TYPES as readonly string[]).includes(t);
  const isDatabaseSourceType = (t: unknown): boolean =>
    typeof t === 'string' && (DATABASE_SOURCE_TYPES as readonly string[]).includes(t);

  // ========== State: Data ==========
  const [tables, setTables] = useState<TableNode[]>([]);
  const [relationships, setRelationships] = useState<JoinRelationship[]>([]);
  const [availableConnections, setAvailableConnections] = useState<any[]>([]);
  const [connectionTables, setConnectionTables] = useState<Record<string, string[]>>({});

  // ========== State: UI ==========
  const [sidebarTab, setSidebarTab] = useState<'data_sources' | 'saved_workflows'>('data_sources');
  const [expandedConns, setExpandedConns] = useState<Set<string>>(new Set());
  const [uploadedFilesExpanded, setUploadedFilesExpanded] = useState<boolean>(false);
  const [transformationsExpanded, setTransformationsExpanded] = useState<boolean>(false);
  const [expandedTransformCategories, setExpandedTransformCategories] = useState<Set<string>>(new Set());
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [configTargetNode, setConfigTargetNode] = useState<TableNode | null>(null);
  const [configSourceNode, setConfigSourceNode] = useState<TableNode | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<{ rows: any[]; columns: string[]; title: string } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinModalData, setJoinModalData] = useState<{
    fromTableId: string;
    fromColumnName: string;
    toTableId: string;
    toColumnName: string;
    isEditing?: boolean;
    editingTableId?: string;
  } | null>(null);
  const [joinForm, setJoinForm] = useState({ joinType: 'inner', filter: '', transform: '' });
  
  // ========== State: Viewport ==========
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  // ========== Effects: Load Data ==========

  // Fetch all connections
  const { data: allConnections = [] } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
  });

  // Filter to only show database connections
  const connections = allConnections.filter((c) => isDatabaseSourceType((c as any)?.source_type));

  // Fetch datasets and filter for uploaded files only
  const { data: datasets = [] } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
  });

  // Only show actual uploaded files (datasets created from a file upload)
  const uploadedFileDatasets = datasets.filter((d: any) => !!d?.original_filename);

  // Update availableConnections when connections change
  useEffect(() => {
    setAvailableConnections(connections.filter((c) => isValidName(c.name)));
  }, [connections]);

  // Load tables from navigation state
  useEffect(() => {
    if (!location.state?.datasets && !location.state?.connections) return;

    const newTables: TableNode[] = [];
    let gridX = 50;
    let gridY = 50;

    // Add datasets
    location.state.datasets?.forEach((ds: any) => {
      if (!isValidName(ds.name)) return;

      const cols = extractColumnsFromDataset(ds);
      newTables.push({
        id: `ds-${ds.id}`,
        type: 'dataset',
        name: sanitizeName(ds.name),
        columns: cols,
        isExpanded: false,
        x: gridX,
        y: gridY,
        rowCount: ds.row_count || 0,
      });
      gridX += 300;
      if (gridX > 900) {
        gridX = 50;
        gridY += 350;
      }
    });

    // Add connection tables
    location.state.connections?.forEach((conn: any) => {
      if (!isValidName(conn.name)) return;

      conn.selectedTables?.forEach((tableName: string) => {
        if (!isValidName(tableName)) return;

        newTables.push({
          id: `conn-${conn.id}-${Date.now()}-${Math.random()}`,
          type: 'database_table',
          name: sanitizeName(tableName),
          source: sanitizeName(conn.name),
          connectionId: conn.id,
          tableName: sanitizeName(tableName),
          columns: [],
          isExpanded: false,
          x: gridX,
          y: gridY,
        });
        gridX += 300;
        if (gridX > 900) {
          gridX = 50;
          gridY += 350;
        }
      });
    });

    setTables(newTables);
  }, [location.state]);

  // Auto-fetch columns for database tables and datasets
  useEffect(() => {
    tables.forEach((table) => {
      if (table.type === 'database_table' && table.columns.length === 0) {
        // Auto-expand and load database table columns
        (async () => {
          try {
            if (!table.connectionId || !table.tableName) return;
            const result = await connectionService.queryData(
              table.connectionId,
              table.tableName,
              1,
              0
            );
            if (result.columns) {
              setTables((prev) =>
                prev.map((t) =>
                  t.id === table.id
                    ? {
                        ...t,
                        columns: result.columns.map((col: any) => ({
                          name: col.name || col,
                          type: col.type || 'string',
                        })),
                      }
                    : t
                )
              );
            }
          } catch (err) {
            console.error(`Failed to fetch columns for ${table.name}:`, err);
          }
        })();
      } else if (table.type === 'dataset' && table.columns.length === 0) {
        // Fetch dataset preview to get columns (same approach as SQL Editor)
        (async () => {
          try {
            // Extract dataset ID from table.id (format: "ds-{id}")
            const datasetId = table.id.replace('ds-', '');
            console.log('Fetching columns for dataset:', { tableId: table.id, datasetId, tableName: table.name });
            
            const preview = await datasetService.getDatasetPreview(datasetId, 20);
            console.log('Preview response:', preview);
            
            let cols: ColumnInfo[] = [];
            
            if (preview?.columns && Array.isArray(preview.columns)) {
              cols = preview.columns.map((colName: string) => ({
                name: colName,
                type: 'string'
              }));
              console.log('✓ Got columns from preview.columns:', cols.length);
            } else if (preview?.rows && Array.isArray(preview.rows) && preview.rows.length > 0) {
              // Extract from first row if columns array not provided
              const firstRow = preview.rows[0];
              cols = Object.keys(firstRow).map(key => ({
                name: key,
                type: typeof firstRow[key]
              }));
              console.log('✓ Got columns from preview.rows:', cols.length);
            }
            
            if (cols.length > 0) {
              setTables((prev) =>
                prev.map((t) =>
                  t.id === table.id
                    ? { ...t, columns: cols }
                    : t
                )
              );
              console.log('✓ Updated table with', cols.length, 'columns');
            } else {
              console.warn('✗ No columns found in preview for:', table.name);
            }
          } catch (err) {
            console.error(`Failed to fetch columns for dataset ${table.name}:`, err);
            // Try fallback to getDatasetById
            try {
              const datasetId = table.id.replace('ds-', '');
              console.log('Trying fallback getDatasetById for:', datasetId);
              const fullDataset = await datasetService.getDatasetById(datasetId);
              console.log('Full dataset response:', fullDataset);
              const cols = extractColumnsFromDataset(fullDataset);
              if (cols.length > 0) {
                setTables((prev) =>
                  prev.map((t) =>
                    t.id === table.id
                      ? { ...t, columns: cols }
                      : t
                  )
                );
                console.log('✓ Fallback succeeded with', cols.length, 'columns');
              }
            } catch (fallbackErr) {
              console.error(`Fallback also failed for dataset ${table.name}:`, fallbackErr);
            }
          }
        })();
      }
    });
  }, [tables]);

  // Filtered data - only show database connections and uploaded files
  const visibleUploadedFiles = useMemo(
    () => uploadedFileDatasets.filter((ds: any) => isValidName(ds.name)),
    [uploadedFileDatasets]
  );

  const visibleConnections = useMemo(
    () => availableConnections.filter((c) => 
      isValidName(c.name) && isDatabaseSourceType((c as any)?.source_type)
    ),
    [availableConnections]
  );

  // ========== Sidebar Handlers ==========

  const toggleConnection = useCallback(
    async (connId: string) => {
      const next = new Set(expandedConns);
      if (next.has(connId)) {
        next.delete(connId);
        setExpandedConns(next);
        return;
      }

      next.add(connId);
      setExpandedConns(next);

      if (!connectionTables[connId]) {
        try {
          const tables = await connectionService.getCollections(connId);
          const filtered = (tables || [])
            .filter(isValidName)
            .map(sanitizeName);
          setConnectionTables((prev) => ({ ...prev, [connId]: filtered }));
        } catch (err) {
          console.error(`Failed to fetch tables for connection ${connId}:`, err);
        }
      }
    },
    [expandedConns, connectionTables]
  );

  // ========== Preview Handler ==========
  
  const handlePreviewData = async (type: 'dataset' | 'database', id: string, name: string, connectionId?: string) => {
    setIsLoadingPreview(true);
    setPreviewModalOpen(true);
    setPreviewData(null);
    
    try {
      if (type === 'dataset') {
        const preview = await datasetService.getDatasetPreview(id, 10);
        const columns = preview?.columns || (preview?.rows?.[0] ? Object.keys(preview.rows[0]) : []);
        setPreviewData({
          title: name,
          columns,
          rows: preview?.rows || []
        });
      } else if (type === 'database' && connectionId) {
        const result = await connectionService.queryData(connectionId, name, 10, 0);
        const columns = result?.columns?.map((c: any) => c.name || c) || 
                       (result?.data?.[0] ? Object.keys(result.data[0]) : []);
        setPreviewData({
          title: name,
          columns,
          rows: result?.data || []
        });
      }
    } catch (err) {
      console.error('Failed to fetch preview data:', err);
      setPreviewData({
        title: name,
        columns: [],
        rows: []
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ========== Canvas Handlers ==========

  const handleDragStart = (e: React.DragEvent, source: DragSource) => {
    e.dataTransfer.setData('application/json', JSON.stringify(source));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const json = e.dataTransfer.getData('application/json');
      if (!json) return;
      
      const data = JSON.parse(json);
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      // Adjust drop coordinates for viewport
      const x = (e.clientX - rect.left - viewport.x) / viewport.scale;
      const y = (e.clientY - rect.top - viewport.y) / viewport.scale;

      if (data.type === 'dataset') {
        const ds = data.dataset || uploadedFileDatasets.find((d) => d.id === data.id);
        if (!ds) {
          console.error('Dataset not found:', data.id);
          return;
        }

        const displayName = ds.original_filename || ds.name;
        console.log('Creating dataset table:', { id: ds.id, name: displayName });
        const newTable: TableNode = {
          id: `ds-${ds.id}`,
          type: 'dataset',
          name: displayName,
          columns: [], // Start with empty, let useEffect fetch columns
          isExpanded: false,
          x,
          y,
          rowCount: ds.row_count || 0,
        };
        setTables((prev) => [...prev, newTable]);
      } else if (data.type === 'database_table') {
        const newTable: TableNode = {
          id: `conn-${data.connectionId}-${Date.now()}-${Math.random()}`,
          type: 'database_table',
          name: sanitizeName(data.name),
          source: data.sourceName,
          connectionId: data.connectionId,
          tableName: sanitizeName(data.name),
          columns: [],
          isExpanded: false,
          x,
          y,
        };
        setTables((prev) => [...prev, newTable]);
      } else if (data.type === 'transformation') {
        // Create transformation node
        const newTable: TableNode = {
          id: `transform-${Date.now()}-${Math.random()}`,
          type: 'transformation',
          name: data.operation || 'Transformation',
          transformationType: data.operation,
          transformationCategory: data.category,
          columns: [],
          isExpanded: false,
          isConfigured: false,
          x,
          y,
        };
        setTables((prev) => [...prev, newTable]);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    setSelectedTableId(tableId);
    setDraggingTableId(tableId);
    const table = tables.find((t) => t.id === tableId);
    if (table && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Calculate mouse position in world coordinates
      const mouseX = (e.clientX - rect.left - viewport.x) / viewport.scale;
      const mouseY = (e.clientY - rect.top - viewport.y) / viewport.scale;
      
      setDragOffset({
        x: mouseX - table.x,
        y: mouseY - table.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Calculate mouse position in world coordinates
      const x = (e.clientX - rect.left - viewport.x) / viewport.scale;
      const y = (e.clientY - rect.top - viewport.y) / viewport.scale;
      setMousePos({ x, y });

      if (draggingTableId) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === draggingTableId
              ? {
                  ...t,
                  x: x - dragOffset.x,
                  y: y - dragOffset.y,
                }
              : t
          )
        );
      } else if (isPanning) {
        const dx = e.clientX - lastPanPos.x;
        const dy = e.clientY - lastPanPos.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setLastPanPos({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const newScale = Math.min(Math.max(0.1, viewport.scale + delta), 5);
      
      // Zoom towards mouse pointer could be implemented here, 
      // but for simplicity let's just zoom center or current position
      setViewport(prev => ({ ...prev, scale: newScale }));
    } else {
      // Pan on scroll
      setViewport(prev => ({ 
        ...prev, 
        x: prev.x - e.deltaX, 
        y: prev.y - e.deltaY 
      }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) { // Middle or Left click
       if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
         setIsPanning(true);
         setLastPanPos({ x: e.clientX, y: e.clientY });
       }
    }
  };

  const handleMouseUp = () => {
    setDraggingTableId(null);
    setDrawing(null);
    setIsPanning(false);
  };

  const handleSaveLineage = () => {
    const data = {
      tables,
      relationships,
      viewport
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lineage-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveTable = (table: TableNode) => {
    // In a real app, this would send the SQL/definition to the backend
    alert(`Saving table definition for ${table.name}...\n\nColumns: ${table.columns.map(c => c.name).join(', ')}`);
  };

  const handleEditTable = (table: TableNode) => {
    if (!table.joinMetadata) return;
    
    const leftTable = tables.find(t => t.name === table.joinMetadata?.leftTable);
    const rightTable = tables.find(t => t.name === table.joinMetadata?.rightTable);
    
    if (!leftTable || !rightTable) {
      alert('Source tables not found!');
      return;
    }

    setJoinModalData({
      fromTableId: leftTable.id,
      fromColumnName: table.joinMetadata.leftColumn,
      toTableId: rightTable.id,
      toColumnName: table.joinMetadata.rightColumn,
      isEditing: true,
      editingTableId: table.id
    });

    setJoinForm({
      joinType: table.joinMetadata.joinType,
      filter: table.joinMetadata.filter || '',
      transform: table.joinMetadata.transform || ''
    });

    setShowJoinModal(true);
  };

  const toggleTableExpand = (tableId: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId ? { ...t, isExpanded: !t.isExpanded } : t
      )
    );
  };

  const handleColumnMouseDown = (
    e: React.MouseEvent,
    tableId: string,
    columnName: string
  ) => {
    e.stopPropagation();
    const pos = getColumnPortPos(tableId, tables.find((t) => t.id === tableId)?.columns.findIndex((c) => c.name === columnName) ?? 0, false);
    if (pos) {
      setDrawing({
        fromTableId: tableId,
        fromColumnName: columnName,
        startX: pos.x,
        startY: pos.y,
      });
    }
  };

  const handleColumnMouseUp = (
    e: React.MouseEvent,
    tableId: string,
    columnName: string
  ) => {
    e.stopPropagation();
    if (drawing && drawing.fromTableId !== tableId) {
      // Check if target is a transformation node
      const targetTable = tables.find(t => t.id === tableId);
      const sourceTable = tables.find(t => t.id === drawing.fromTableId);
      
      if (targetTable?.type === 'transformation') {
        // Open transformation configuration modal
        if (!targetTable.isConfigured) {
          setConfigTargetNode(targetTable);
          setConfigSourceNode(sourceTable || null);
          setConfigModalOpen(true);
        } else {
          // Already configured, just create relationship
          setRelationships((prev) => [
            ...prev,
            {
              id: `rel-${Date.now()}-${Math.random()}`,
              fromTableId: drawing.fromTableId,
              fromColumnName: drawing.fromColumnName,
              toTableId: tableId,
              toColumnName: columnName,
              joinType: 'inner',
            },
          ]);
        }
      } else {
        // Regular join modal
        setShowJoinModal(true);
        setJoinModalData({
          fromTableId: drawing.fromTableId,
          fromColumnName: drawing.fromColumnName,
          toTableId: tableId,
          toColumnName: columnName,
        });
      }
    }
    setDrawing(null);
  };

  const deleteJoin = () => {
    if (!joinModalData || !joinModalData.editingTableId) return;
    const tableToDelete = tables.find((t) => t.id === joinModalData.editingTableId);
    if (!tableToDelete || !tableToDelete.joinMetadata) return;

    const { leftTable, rightTable, leftColumn, rightColumn } = tableToDelete.joinMetadata;

    const fromTable = tables.find((t) => t.name === leftTable);
    const toTable = tables.find((t) => t.name === rightTable);

    if (fromTable && toTable) {
      setRelationships((prev) =>
        prev.filter((r) => {
          const isSourceRel =
            r.fromTableId === fromTable.id &&
            r.toTableId === toTable.id &&
            r.fromColumnName === leftColumn &&
            r.toColumnName === rightColumn;
          const isLineageRel =
            r.fromTableId === tableToDelete.id || r.toTableId === tableToDelete.id;
          return !isSourceRel && !isLineageRel;
        })
      );
    }

    setTables((prev) => prev.filter((t) => t.id !== tableToDelete.id));
    setShowJoinModal(false);
    setJoinModalData(null);
    setJoinForm({ joinType: 'inner', filter: '', transform: '' });
  };

  const confirmJoin = () => {
    if (!joinModalData) return;

    if (joinModalData.isEditing && joinModalData.editingTableId) {
      // EDIT MODE
      const { editingTableId } = joinModalData;
      const tableToEdit = tables.find((t) => t.id === editingTableId);
      
      if (tableToEdit && tableToEdit.joinMetadata) {
          const oldLeftColumn = tableToEdit.joinMetadata.leftColumn;
          const oldRightColumn = tableToEdit.joinMetadata.rightColumn;
          const oldLeftTableName = tableToEdit.joinMetadata.leftTable;
          const oldRightTableName = tableToEdit.joinMetadata.rightTable;
          
          const fromTable = tables.find(t => t.name === oldLeftTableName);
          const toTable = tables.find(t => t.name === oldRightTableName);

          // 1. Update the Derived Table Metadata
          setTables((prev) =>
            prev.map((t) => {
              if (t.id === editingTableId) {
                return {
                  ...t,
                  joinMetadata: {
                    ...t.joinMetadata!,
                    joinType: joinForm.joinType,
                    filter: joinForm.filter,
                    transform: joinForm.transform,
                    leftColumn: joinModalData.fromColumnName,
                    rightColumn: joinModalData.toColumnName
                  },
                };
              }
              return t;
            })
          );

          // 2. Update the Relationship between the source tables
          if (fromTable && toTable) {
              setRelationships((prev) =>
                prev.map((r) => {
                  if (
                    r.fromTableId === fromTable.id &&
                    r.toTableId === toTable.id &&
                    r.fromColumnName === oldLeftColumn &&
                    r.toColumnName === oldRightColumn
                  ) {
                    return {
                      ...r,
                      fromColumnName: joinModalData.fromColumnName,
                      toColumnName: joinModalData.toColumnName,
                      joinType: joinForm.joinType as any,
                      filterCondition: joinForm.filter || undefined,
                      transformations: joinForm.transform || undefined,
                    };
                  }
                  return r;
                })
              );
          }
      }
    } else {
      // CREATE MODE
      const rel: JoinRelationship = {
        id: `rel-${Date.now()}`,
        fromTableId: joinModalData.fromTableId,
        fromColumnName: joinModalData.fromColumnName,
        toTableId: joinModalData.toTableId,
        toColumnName: joinModalData.toColumnName,
        joinType: joinForm.joinType as any,
        filterCondition: joinForm.filter || undefined,
        transformations: joinForm.transform || undefined,
      };

      // Create derived table
      const fromTable = tables.find((t) => t.id === joinModalData.fromTableId);
      const toTable = tables.find((t) => t.id === joinModalData.toTableId);

      if (fromTable && toTable) {
        // Prefix columns to ensure uniqueness and clarity in the derived table
        const derivedColumns = [
          ...fromTable.columns.map((c) => ({
            ...c,
            name: `${fromTable.name}.${c.name}`,
          })),
          ...toTable.columns.map((c) => ({
            ...c,
            name: `${toTable.name}.${c.name}`,
          })),
        ];

        const derivedTableId = `derived-${Date.now()}`;
        const derivedTable: TableNode = {
          id: derivedTableId,
          type: 'derived',
          name: `${fromTable.name}_${toTable.name}_joined`,
          columns: derivedColumns,
          isExpanded: true,
          x: (fromTable.x + toTable.x) / 2,
          y: (fromTable.y + toTable.y) / 2 + 200,
          joinMetadata: {
            joinType: joinForm.joinType,
            leftTable: fromTable.name,
            rightTable: toTable.name,
            leftColumn: joinModalData.fromColumnName,
            rightColumn: joinModalData.toColumnName,
            filter: joinForm.filter,
            transform: joinForm.transform,
          },
        };

        setTables((prev) => [...prev, derivedTable]);

        // Create lineage relationships (all columns)
        const newRelationships: JoinRelationship[] = [];

        // From Table -> Derived
        fromTable.columns.forEach((col) => {
          newRelationships.push({
            id: `lineage-${fromTable.id}-${col.name}-${derivedTableId}`,
            fromTableId: fromTable.id,
            fromColumnName: col.name,
            toTableId: derivedTableId,
            toColumnName: `${fromTable.name}.${col.name}`,
            joinType: 'inner', // Lineage is always a direct flow
          });
        });

        // To Table -> Derived
        toTable.columns.forEach((col) => {
          newRelationships.push({
            id: `lineage-${toTable.id}-${col.name}-${derivedTableId}`,
            fromTableId: toTable.id,
            fromColumnName: col.name,
            toTableId: derivedTableId,
            toColumnName: `${toTable.name}.${col.name}`,
            joinType: 'inner',
          });
        });

        setRelationships((prev) => [...prev, rel, ...newRelationships]);
      } else {
        setRelationships((prev) => [...prev, rel]);
      }
    }

    setShowJoinModal(false);
    setJoinModalData(null);
    setJoinForm({ joinType: 'inner', filter: '', transform: '' });
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>, tableId: string) => {
    const scrollTop = e.currentTarget.scrollTop;
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, scrollTop } : t))
    );
  };

  const getColumnPortPos = (tableId: string, columnIndex: number, isInput: boolean = false): { x: number; y: number } | null => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return null;

    // Calculate header height based on type
    // Dataset: ~46px (padding + text)
    // Database/Derived: ~66px (padding + text + source)
    const headerHeight = table.type === 'dataset' ? 46 : 66;
    
    if (!table.isExpanded) {
       return {
         x: isInput ? table.x : table.x + 320,
         y: table.y + (headerHeight / 2)
       };
    }

    const columnHeight = 33; // 32px content + 1px border
    const scrollTop = table.scrollTop || 0;
    
    // Calculate position relative to table top
    // Header + (Index * RowHeight) + (RowHeight / 2) - Scroll
    const relativeY = headerHeight + (columnIndex * columnHeight) + (columnHeight / 2) - scrollTop;
    
    // Optional: Clamp to visible area if needed, but for now let it float
    // If we wanted to hide lines for scrolled-out columns, we'd return null here if relativeY < headerHeight or relativeY > headerHeight + 320 (max-h-80)

    return {
      x: isInput ? table.x : table.x + 320,
      y: table.y + relativeY,
    };
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* SIDEBAR */}
      <div className="w-80 border-r-2 border-slate-300 flex flex-col overflow-hidden shadow-xl" style={{
        background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)'
      }}>
        <div className="p-6 border-b-2 border-slate-300 shadow-md" style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)'
        }}>
          <h2 className="font-bold text-white text-base flex items-center gap-2">🧩 WORKFLOW BUILDER</h2>
          <p className="text-xs text-blue-100 mt-2">Drag tables to canvas to build lineage</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white">
          <button
            onClick={() => setSidebarTab('data_sources')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              sidebarTab === 'data_sources'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            Data Sources
          </button>
          <button
            onClick={() => setSidebarTab('saved_workflows')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              sidebarTab === 'saved_workflows'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            Saved Workflows
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '12px' }}>
          {sidebarTab === 'data_sources' ? (
            <>
              {/* Database Connections */}
              {visibleConnections.length > 0 && visibleConnections.map((conn) => (
                <div key={conn.id} style={{ marginBottom: '8px' }}>
                  <button
                    onClick={() => toggleConnection(conn.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:shadow-md transition-all font-semibold"
                    style={{
                      border: '1px solid #e2e8f0',
                      background: expandedConns.has(conn.id) 
                        ? '#f8fafc'
                        : '#ffffff'
                    }}
                  >
                    <span className="flex items-center gap-2 truncate" style={{ minWidth: 0 }}>
                      <span className="text-base" style={{ color: '#64748b' }}>🗄️</span>
                      <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</span>
                    </span>
                    <span className="text-xs" style={{ color: '#64748b', flexShrink: 0 }}>
                      {expandedConns.has(conn.id) ? '▼' : '▶'}
                    </span>
                  </button>
                  {expandedConns.has(conn.id) && (
                    <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, padding: '6px 8px' }}>
                        TABLES
                      </div>
                      {connectionTables[conn.id]?.length ? (
                        connectionTables[conn.id].map((tableName) => (
                          <div
                            key={tableName}
                            className="group relative"
                            style={{ marginBottom: '4px' }}
                          >
                            <div
                              draggable
                              onDragStart={(e) =>
                                handleDragStart(e, {
                                  id: tableName,
                                  name: tableName,
                                  type: 'database_table',
                                  connectionId: conn.id,
                                  sourceName: conn.name,
                                })
                              }
                              style={{
                                padding: '8px 12px',
                                paddingRight: '40px',
                                fontSize: '11px',
                                borderRadius: '8px',
                                cursor: 'grab',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                              className="hover:bg-slate-50"
                              title={tableName}
                            >
                              <span style={{ fontSize: '12px', flexShrink: 0 }}>📋</span>
                              <span style={{ 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0
                              }}>{tableName}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewData('database', tableName, tableName, conn.id);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs font-bold z-10"
                              title="Preview data"
                            >
                              ...
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8' }}>
                          Loading tables...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Uploaded Files - Single Collapsible Group */}
              {visibleUploadedFiles.length > 0 && (
                <div style={{ marginTop: visibleConnections.length > 0 ? '8px' : '0', marginBottom: '8px' }}>
                  <button
                    onClick={() => setUploadedFilesExpanded(!uploadedFilesExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:shadow-md transition-all font-semibold"
                    style={{
                      border: '1px solid #e2e8f0',
                      background: '#ffffff'
                    }}
                  >
                    <span className="flex items-center gap-2 truncate" style={{ minWidth: 0 }}>
                      <span className="text-base" style={{ color: '#64748b' }}>📁</span>
                      <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Uploaded Files</span>
                    </span>
                    <span className="text-xs" style={{ color: '#64748b', flexShrink: 0 }}>
                      {uploadedFilesExpanded ? '▼' : '▶'}
                    </span>
                  </button>
                  {uploadedFilesExpanded && (
                    <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, padding: '6px 8px' }}>
                        FILES
                      </div>
                      {visibleUploadedFiles.map((ds: any) => {
                        const displayName = ds.original_filename || ds.name;
                        return (
                        <div
                          key={ds.id}
                          className="group relative"
                          style={{ marginBottom: '4px' }}
                        >
                          <div
                            draggable
                            onDragStart={(e) =>
                              handleDragStart(e, { id: ds.id, name: displayName, type: 'dataset', dataset: ds })
                            }
                            style={{
                              padding: '8px 12px',
                              paddingRight: '40px',
                              fontSize: '11px',
                              borderRadius: '8px',
                              cursor: 'grab',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            className="hover:bg-slate-50"
                            title={displayName}
                          >
                            <span style={{ fontSize: '12px', flexShrink: 0 }}>📄</span>
                            <span style={{ 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap',
                              flex: 1,
                              minWidth: 0
                            }}>{displayName}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewData('dataset', String(ds.id), displayName);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs font-bold z-10"
                            title="Preview data"
                          >
                            ...
                          </button>
                        </div>
                      );})}
                    </div>
                  )}
                </div>
              )}

              {/* Separator Line */}
              {(visibleConnections.length > 0 || visibleUploadedFiles.length > 0) && (
                <div style={{ borderTop: '2px solid #cbd5e1', marginTop: '12px', marginBottom: '12px' }}></div>
              )}

              {/* Transformations Section */}
              <div style={{ marginBottom: '8px' }}>
                <button
                  onClick={() => setTransformationsExpanded(!transformationsExpanded)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:shadow-md transition-all font-semibold"
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#ffffff'
                  }}
                >
                  <span className="flex items-center gap-2 truncate" style={{ minWidth: 0 }}>
                    <span className="text-base" style={{ color: '#64748b' }}>⚙️</span>
                    <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Transformations</span>
                  </span>
                  <span className="text-xs" style={{ color: '#64748b', flexShrink: 0 }}>
                    {transformationsExpanded ? '▼' : '▶'}
                  </span>
                </button>
                {transformationsExpanded && (
                  <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                    {[
                      { 
                        id: 'filters', 
                        label: 'Filter', 
                        icon: '🔍'
                      },
                      { 
                        id: 'join-combine', 
                        label: 'Join & Combine', 
                        icon: '🔗'
                      },
                      { 
                        id: 'aggregate', 
                        label: 'Aggregate', 
                        icon: '📊'
                      },
                      { 
                        id: 'columns', 
                        label: 'Select Columns', 
                        icon: '📋'
                      },
                      { 
                        id: 'date-time', 
                        label: 'Date & Time', 
                        icon: '📅'
                      },
                      { 
                        id: 'text', 
                        label: 'Text Operations', 
                        icon: '📝'
                      },
                      { 
                        id: 'pivot', 
                        label: 'Pivot', 
                        icon: '🔄'
                      }
                    ].map((category) => (
                      <div
                        key={category.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'transformation',
                            category: category.id,
                            operation: category.label
                          }));
                        }}
                        style={{
                          padding: '8px 12px',
                          fontSize: '11px',
                          borderRadius: '8px',
                          cursor: 'grab',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#ffffff'
                        }}
                        className="hover:bg-slate-50 hover:shadow-md transition-all"
                        title={`Drag to canvas: ${category.label}`}
                      >
                        <span style={{ fontSize: '12px' }}>{category.icon}</span>
                        <span>{category.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-500">Saved workflows coming soon...</p>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CANVAS */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="font-bold text-slate-800 text-lg">Data Lineage</h1>
            <p className="text-xs text-slate-600">Visualize data flow and relationships</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setTables([])}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-all font-medium"
            >
              Clear Canvas
            </button>
            <button 
              onClick={handleSaveLineage}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-sm"
            >
              Save Lineage
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
          onClick={() => setSelectedTableId(null)}
          className="flex-1 relative bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 overflow-hidden cursor-grab active:cursor-grabbing"
        >
          {/* Transform Container */}
          <div 
            style={{ 
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: '0 0',
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0
            }}
          >
          {/* Grid Background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-50"
            style={{
              backgroundImage: 'radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)',
              backgroundSize: '28px 28px',
              width: '10000px', // Large enough to cover pan
              height: '10000px',
              transform: 'translate(-5000px, -5000px)' // Center the grid
            }}
          />

          {/* SVG Relationships */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {relationships.map((rel) => {
              const fromTable = tables.find((t) => t.id === rel.fromTableId);
              const toTable = tables.find((t) => t.id === rel.toTableId);
              if (!fromTable || !toTable) return null;

              const fromColIdx = fromTable.columns.findIndex((c) => c.name === rel.fromColumnName);
              const toColIdx = toTable.columns.findIndex((c) => c.name === rel.toColumnName);
              if (fromColIdx === -1 || toColIdx === -1) return null;

              const fromPos = getColumnPortPos(rel.fromTableId, fromColIdx, false);
              const toPos = getColumnPortPos(rel.toTableId, toColIdx, true);
              if (!fromPos || !toPos) return null;

              const midX = (fromPos.x + toPos.x) / 2;
              const path = `M ${fromPos.x} ${fromPos.y} C ${midX} ${fromPos.y}, ${midX} ${toPos.y}, ${toPos.x} ${toPos.y}`;

              return (
                <g key={rel.id}>
                  <path d={path} stroke="#94a3b8" strokeWidth="2" fill="none" />
                  {/* Start Dot */}
                  <circle cx={fromPos.x} cy={fromPos.y} r="4" fill="#64748b" stroke="white" strokeWidth="1.5" />
                  {/* End Dot */}
                  <circle cx={toPos.x} cy={toPos.y} r="4" fill="#64748b" stroke="white" strokeWidth="1.5" />
                </g>
              );
            })}

            {/* Drawing line */}
            {drawing && (
              <path
                d={`M ${drawing.startX} ${drawing.startY} L ${mousePos.x} ${mousePos.y}`}
                stroke="#10b981"
                strokeWidth="2.5"
                fill="none"
                strokeDasharray="6,4"
                opacity="0.8"
              />
            )}
          </svg>

          {/* Tables */}
          {tables.map((table) => (
            <div
              key={table.id}
              className={`absolute rounded-xl overflow-hidden transition-shadow ${
                selectedTableId === table.id
                  ? 'border-3 border-blue-600 shadow-2xl shadow-blue-400/40'
                  : 'border-2 border-slate-400 shadow-xl hover:shadow-2xl'
              }`}
              style={{
                left: `${table.x}px`,
                top: `${table.y}px`,
                width: table.type === 'transformation' ? '240px' : 'auto',
                minWidth: table.type === 'transformation' ? '240px' : '320px',
                maxWidth: table.type === 'transformation' ? '240px' : '480px',
                backgroundColor: table.type === 'transformation' ? '#3b82f6' : '#ffffff',
                zIndex: selectedTableId === table.id ? 50 : 10,
                transform: selectedTableId === table.id ? 'scale(1.02)' : 'scale(1)',
              }}
              onMouseDown={(e) => handleTableMouseDown(e, table.id)}
            >
              {/* Transformation Node Rendering */}
              {table.type === 'transformation' ? (
                <div className="p-6 text-center relative">
                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTables((prev) => prev.filter((t) => t.id !== table.id));
                      setRelationships((prev) => prev.filter((r) => r.fromTableId !== table.id && r.toTableId !== table.id));
                    }}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-white/90 hover:bg-red-500 text-slate-600 hover:text-white rounded-full shadow-md transition-all font-bold text-sm"
                    title="Remove transformation"
                  >
                    ×
                  </button>
                  
                  <div className="text-white text-4xl mb-3">⚙️</div>
                  <h3 className="font-bold text-white text-base mb-2">{table.name}</h3>
                  {table.isConfigured && table.transformationConfig?.operation && (
                    <p className="text-xs text-blue-100 mb-3">
                      {table.transformationConfig.operation}
                    </p>
                  )}
                  {!table.isConfigured && (
                    <p className="text-xs text-blue-200 italic">Not configured</p>
                  )}
                  
                  {/* Input Connection Point */}
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 cursor-crosshair hover:scale-125 transition-all shadow-lg"
                    onMouseUp={(e) => handleColumnMouseUp(e, table.id, 'input')}
                    title="Connect input here"
                  />
                  
                  {/* Output Connection Point */}
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 cursor-crosshair hover:scale-125 transition-all shadow-lg"
                    onMouseDown={(e) => handleColumnMouseDown(e, table.id, 'output')}
                    title="Drag to connect output"
                  />
                </div>
              ) : (
                <>
              {/* Header */}
              <div
                className={`px-4 py-3 cursor-move border-b border-slate-200 shadow-sm relative ${
                  table.type === 'derived'
                    ? 'bg-yellow-400'
                    : table.type === 'database_table'
                    ? 'bg-orange-400'
                    : 'bg-blue-400'
                }`}
                onDoubleClick={() => toggleTableExpand(table.id)}
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTables((prev) => prev.filter((t) => t.id !== table.id));
                    setRelationships((prev) => prev.filter((r) => r.fromTableId !== table.id && r.toTableId !== table.id));
                  }}
                  className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-white/90 hover:bg-red-500 text-slate-600 hover:text-white rounded-full shadow-md transition-all font-bold text-xs z-10"
                  title="Remove table"
                >
                  ×
                </button>
                
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 
                        className="font-bold text-slate-900 text-sm tracking-tight truncate" 
                        title={table.name}
                      >
                        {table.name}
                      </h3>
                    </div>
                    {table.source && (
                      <p className="text-xs text-slate-800/70 flex items-center gap-1 font-medium truncate" title={table.source}>
                        {table.source}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pr-6">
                    {table.type === 'derived' && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTable(table);
                          }}
                          className="p-1 hover:bg-black/10 rounded text-slate-800"
                          title="Edit Join"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveTable(table);
                          }}
                          className="p-1 hover:bg-black/10 rounded text-slate-800"
                          title="Save Table"
                        >
                          💾
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => toggleTableExpand(table.id)}
                      className="text-slate-800 hover:text-black transition-colors"
                    >
                      {table.isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Join Metadata Info */}
              {table.joinMetadata && table.isExpanded && (
                <div className="px-4 py-2 bg-yellow-100 border-b border-yellow-200 text-xs text-slate-800">
                  <div className="font-bold mb-1">Join Details:</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-slate-600">Type:</span>
                    <span className="font-mono uppercase">{table.joinMetadata.joinType}</span>
                    <span className="text-slate-600">Left:</span>
                    <span className="truncate" title={table.joinMetadata.leftColumn}>{table.joinMetadata.leftColumn}</span>
                    <span className="text-slate-600">Right:</span>
                    <span className="truncate" title={table.joinMetadata.rightColumn}>{table.joinMetadata.rightColumn}</span>
                  </div>
                </div>
              )}

              {/* Columns */}
              {table.isExpanded && (
                <div 
                  className={`max-h-80 overflow-y-auto divide-y divide-slate-200/50 ${
                    table.type === 'derived'
                      ? 'bg-yellow-50'
                      : table.type === 'database_table'
                      ? 'bg-orange-50'
                      : 'bg-blue-50'
                  }`}
                  onScroll={(e) => handleTableScroll(e, table.id)}
                >
                  {table.columns.length > 0 ? (
                    table.columns.map((col, idx) => (
                      <div
                        key={`${col.name}-${idx}`}
                        className="px-4 py-2 text-xs flex items-center justify-between hover:bg-white/50 group relative transition-all border-b border-slate-100 last:border-0"
                        title={`${col.type}${col.nullable ? ' (nullable)' : ''}`}
                      >
                        {/* Input Port */}
                        <div
                          className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-slate-300 cursor-crosshair transition-all ${
                            table.type === 'derived' ? 'bg-yellow-200 hover:bg-yellow-400' :
                            table.type === 'database_table' ? 'bg-orange-200 hover:bg-orange-400' :
                            'bg-blue-200 hover:bg-blue-400'
                          }`}
                          onMouseUp={(e) => handleColumnMouseUp(e, table.id, col.name)}
                        />

                        {/* Column Info */}
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium truncate">{col.name}</span>
                          </div>
                        </div>

                        {/* Output Port */}
                        <div
                          className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-slate-300 cursor-crosshair transition-all ${
                            table.type === 'derived' ? 'bg-yellow-200 hover:bg-yellow-400' :
                            table.type === 'database_table' ? 'bg-orange-200 hover:bg-orange-400' :
                            'bg-blue-200 hover:bg-blue-400'
                          }`}
                          onMouseDown={(e) => handleColumnMouseDown(e, table.id, col.name)}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-xs text-slate-400 bg-white">
                      No columns available
                    </div>
                  )}
                </div>
              )}
              </>
              )}
            </div>
          ))}
          </div>
          {/* End Transform Container */}
        </div>
      </div>

      {/* JOIN MODAL */}
      {showJoinModal && joinModalData ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-md border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Create Relationship</h2>
            <p className="text-sm text-slate-600 mb-6">Define how these tables connect</p>

            <div className="space-y-5">
              <div className="text-sm text-slate-700 pb-4 border-b border-slate-200 bg-slate-50 rounded-lg p-4">
                <p className="font-medium mb-2">Connection:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                    {tables.find((t) => t.id === joinModalData.fromTableId)?.name}
                  </span>
                  
                  <select
                    value={joinModalData.fromColumnName}
                    onChange={(e) => setJoinModalData({...joinModalData, fromColumnName: e.target.value})}
                    className="text-blue-600 font-mono text-xs border-b border-blue-300 focus:outline-none bg-transparent max-w-[100px]"
                  >
                    {tables.find((t) => t.id === joinModalData.fromTableId)?.columns.map(col => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>

                  <span className="text-slate-400">→</span>
                  
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold">
                    {tables.find((t) => t.id === joinModalData.toTableId)?.name}
                  </span>

                  <select
                    value={joinModalData.toColumnName}
                    onChange={(e) => setJoinModalData({...joinModalData, toColumnName: e.target.value})}
                    className="text-emerald-600 font-mono text-xs border-b border-emerald-300 focus:outline-none bg-transparent max-w-[100px]"
                  >
                    {tables.find((t) => t.id === joinModalData.toTableId)?.columns.map(col => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  Join Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['inner', 'left', 'right', 'full'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setJoinForm({ ...joinForm, joinType: type })}
                      className={`px-3 py-2.5 rounded-lg border-2 text-xs capitalize font-bold transition-all ${
                        joinForm.joinType === type
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                          : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Filter Condition <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={joinForm.filter}
                  onChange={(e) => setJoinForm({ ...joinForm, filter: e.target.value })}
                  placeholder="e.g. status = 'active'"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Transformations <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={joinForm.transform}
                  onChange={(e) => setJoinForm({ ...joinForm, transform: e.target.value })}
                  placeholder="e.g. CAST(date_column AS DATE)"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8 justify-end">
              {joinModalData.isEditing && (
                <button
                  onClick={deleteJoin}
                  className="px-5 py-2.5 text-sm font-semibold text-red-600 border-2 border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-all mr-auto"
                >
                  Delete Join
                </button>
              )}
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setJoinModalData(null);
                }}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmJoin}
                className="px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
              >
                {joinModalData.isEditing ? 'Update Relationship' : 'Create Relationship'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Transformation Configuration Modal */}
      <TransformationConfigModal
        isOpen={configModalOpen}
        transformationType={configTargetNode?.transformationType || ''}
        transformationCategory={configTargetNode?.transformationCategory || ''}
        sourceNode={configSourceNode}
        onSave={(config) => {
          if (!configTargetNode) return;
          
          // Update the transformation node with configuration
          setTables((prev) =>
            prev.map((t) =>
              t.id === configTargetNode.id
                ? { ...t, transformationConfig: config, isConfigured: true }
                : t
            )
          );
          
          // Create relationship if drawing was active
          if (drawing && configSourceNode) {
            setRelationships((prev) => [
              ...prev,
              {
                id: `rel-${Date.now()}-${Math.random()}`,
                fromTableId: configSourceNode.id,
                fromColumnName: drawing.fromColumnName,
                toTableId: configTargetNode.id,
                toColumnName: 'output',
                joinType: 'inner',
              },
            ]);
          }
          
          setConfigModalOpen(false);
          setConfigTargetNode(null);
          setConfigSourceNode(null);
        }}
        onCancel={() => {
          setConfigModalOpen(false);
          setConfigTargetNode(null);
          setConfigSourceNode(null);
        }}
      />

      {/* Data Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-800">
                Preview: {previewData?.title || 'Loading...'}
              </h2>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-600">Loading preview...</div>
                </div>
              ) : previewData && previewData.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100">
                        {previewData.columns.map((col, idx) => (
                          <th
                            key={idx}
                            className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                        >
                          {previewData.columns.map((col, colIdx) => (
                            <td
                              key={colIdx}
                              className="px-4 py-3 text-sm text-slate-800 border-b border-slate-200 max-w-xs truncate"
                              title={String(row[col] ?? '')}
                            >
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-400 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-sm text-slate-600 text-center">
                    Showing first {previewData.rows.length} rows
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-600">No data available</div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
