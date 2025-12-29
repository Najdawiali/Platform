import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { datasetService } from '../services/datasetService';
import type { Dataset, DatasetDetail } from '../types';

const getFileIcon = (sourceType: string) => {
  switch (sourceType) {
    case 'csv':
      return '📊';
    case 'excel':
      return '📗';
    case 'json':
      return '📋';
    case 'txt':
      return '📄';
    case 'md':
      return '📝';
    case 'mdx':
      return '📘';
    case 'pdf':
      return '📕';
    default:
      return '📁';
  }
};

const getFileTypeName = (sourceType: string) => {
  switch (sourceType) {
    case 'csv':
      return 'CSV';
    case 'excel':
      return 'Excel';
    case 'json':
      return 'JSON';
    case 'txt':
      return 'Text';
    case 'md':
      return 'Markdown';
    case 'mdx':
      return 'MDX';
    case 'pdf':
      return 'PDF';
    default:
      return sourceType.toUpperCase();
  }
};

const getFileTypeFromFilename = (filename?: string): string => {
  if (!filename) return 'csv';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return 'excel';
    case 'json':
      return 'json';
    case 'txt':
      return 'txt';
    case 'md':
      return 'md';
    case 'mdx':
      return 'mdx';
    case 'pdf':
      return 'pdf';
    default:
      return 'csv';
  }
};

const inferTypeFromRows = (columnName: string, rows: Array<Record<string, any>>): string => {
  for (const row of rows) {
    const value = row?.[columnName];
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return 'string';
      const asNumber = Number(trimmed);
      if (!Number.isNaN(asNumber) && trimmed !== '') return 'number';
      const asDate = Date.parse(trimmed);
      if (!Number.isNaN(asDate) && /\d{4}-\d{2}-\d{2}/.test(trimmed)) return 'date';
      return 'string';
    }
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
  }
  return 'unknown';
};

type NormalizedColumn = {
  sourceKey: string;
  name: string;
  type?: string;
};

const normalizeColumns = (
  schemaColumns: any,
  previewColumns: string[] | undefined,
  rows: Array<Record<string, any>>
): NormalizedColumn[] => {
  const out: NormalizedColumn[] = [];

  if (Array.isArray(schemaColumns) && schemaColumns.length > 0) {
    for (const col of schemaColumns) {
      if (typeof col === 'string') {
        out.push({ sourceKey: col, name: col.toLowerCase(), type: inferTypeFromRows(col, rows) });
      } else if (col && typeof col === 'object') {
        const originalName = String(col.name ?? col);
        out.push({
          sourceKey: originalName,
          name: originalName.toLowerCase(),
          type: col.type,
        });
      }
    }
    return out;
  }

  if (Array.isArray(previewColumns) && previewColumns.length > 0) {
    for (const colName of previewColumns) {
      out.push({ sourceKey: colName, name: colName.toLowerCase(), type: inferTypeFromRows(colName, rows) });
    }
    return out;
  }

  const fromRows = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
  for (const colName of fromRows) {
    out.push({ sourceKey: colName, name: colName.toLowerCase(), type: inferTypeFromRows(colName, rows) });
  }
  return out;
};

export const FileUploadsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schema' | 'preview'>('schema');
  const [schemaNameWidth, setSchemaNameWidth] = useState<number>(360);
  const schemaTypeWidth = 180;
  const resizeRef = useRef<{ dragging: boolean; startX: number; startWidth: number }>({
    dragging: false,
    startX: 0,
    startWidth: 360,
  });
  const sampleTableRef = useRef<HTMLDivElement>(null);
  const previewTableRef = useRef<HTMLDivElement>(null);
  const dragScrollRef = useRef<{ dragging: boolean; startX: number; startScrollLeft: number; el: HTMLDivElement | null }>({
    dragging: false,
    startX: 0,
    startScrollLeft: 0,
    el: null,
  });

  type SidebarItem =
    | { kind: 'file'; datasetId: string }
    | { kind: 'folder'; folderId: string };

  type Folder = {
    id: string;
    name: string;
    expanded: boolean;
    fileIds: string[];
  };

  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [folders, setFolders] = useState<Record<string, Folder>>({});
  const sidebarDndRef = useRef<{
    dragging:
      | null
      | { kind: 'file'; datasetId: string; from: { kind: 'root' } | { kind: 'folder'; folderId: string } }
      | { kind: 'folder'; folderId: string };
  }>({ dragging: null });

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current.dragging) return;
      const delta = e.clientX - resizeRef.current.startX;
      const next = resizeRef.current.startWidth + delta;
      const clamped = Math.max(220, Math.min(900, next));
      setSchemaNameWidth(clamped);
    };

    const onMouseUp = () => {
      if (!resizeRef.current.dragging) return;
      resizeRef.current.dragging = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const state = dragScrollRef.current;
      if (!state.dragging || !state.el) return;
      const deltaX = e.clientX - state.startX;
      state.el.scrollLeft = state.startScrollLeft - deltaX;
    };

    const onMouseUp = () => {
      const state = dragScrollRef.current;
      if (!state.dragging) return;
      state.dragging = false;
      if (state.el) state.el.style.cursor = 'grab';
      state.el = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const { data: datasets = [], isLoading: datasetsLoading } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
  });

  const fileDatasets = useMemo(() => {
    return datasets.filter((d) => !!d.original_filename);
  }, [datasets]);

  const sortedFiles = useMemo(() => {
    return [...fileDatasets].sort((a, b) => a.name.localeCompare(b.name));
  }, [fileDatasets]);

  const datasetsById = useMemo(() => {
    const map = new Map<string, Dataset>();
    for (const d of sortedFiles) map.set(d.id, d);
    return map;
  }, [sortedFiles]);

  const STORAGE_KEY = 'dataPlatform.fileUploads.sidebarLayout.v1';

  const persistSidebarLayout = (nextSidebarItems: SidebarItem[], nextFolders: Record<string, Folder>) => {
    try {
      const payload = {
        sidebarItems: nextSidebarItems,
        folders: nextFolders,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    // Persist any layout changes
    persistSidebarLayout(sidebarItems, folders);
  }, [sidebarItems, folders]);

  useEffect(() => {
    // Initialize sidebar layout from localStorage, then reconcile with current datasets
    const allFileIds = sortedFiles.map((d) => d.id);
    const fileIdSet = new Set(allFileIds);

    let loadedItems: SidebarItem[] | null = null;
    let loadedFolders: Record<string, Folder> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sidebarItems) && parsed.folders && typeof parsed.folders === 'object') {
          loadedItems = parsed.sidebarItems;
          loadedFolders = parsed.folders;
        }
      }
    } catch {
      // ignore
    }

    const nextFolders: Record<string, Folder> = {};
    const assigned = new Set<string>();

    if (loadedFolders) {
      for (const [folderId, folder] of Object.entries(loadedFolders)) {
        const keptFileIds = (folder.fileIds || []).filter((id) => fileIdSet.has(id));
        for (const id of keptFileIds) assigned.add(id);
        nextFolders[folderId] = {
          id: folder.id || folderId,
          name: String(folder.name || 'Folder'),
          expanded: folder.expanded !== false,
          fileIds: keptFileIds,
        };
      }
    }

    const buildDefaultItems = (): SidebarItem[] => allFileIds.map((id) => ({ kind: 'file', datasetId: id }));

    let nextItems: SidebarItem[] = [];
    if (loadedItems) {
      for (const item of loadedItems) {
        if (!item || typeof item !== 'object') continue;
        if (item.kind === 'folder' && typeof (item as any).folderId === 'string') {
          const folderId = (item as any).folderId as string;
          if (nextFolders[folderId]) nextItems.push({ kind: 'folder', folderId });
        }
        if (item.kind === 'file' && typeof (item as any).datasetId === 'string') {
          const datasetId = (item as any).datasetId as string;
          if (fileIdSet.has(datasetId) && !assigned.has(datasetId)) {
            nextItems.push({ kind: 'file', datasetId });
            assigned.add(datasetId);
          }
        }
      }
    } else {
      nextItems = buildDefaultItems();
    }

    // Append any new/unassigned files
    for (const id of allFileIds) {
      if (!assigned.has(id)) nextItems.push({ kind: 'file', datasetId: id });
    }

    setFolders(nextFolders);
    setSidebarItems(nextItems);
  }, [sortedFiles]);

  useEffect(() => {
    if (selectedFileId && datasetsById.has(selectedFileId)) return;
    const firstFileId = (() => {
      // Prefer first visible file in sidebar order
      for (const item of sidebarItems) {
        if (item.kind === 'file' && datasetsById.has(item.datasetId)) return item.datasetId;
        if (item.kind === 'folder') {
          const folder = folders[item.folderId];
          if (!folder) continue;
          for (const fid of folder.fileIds) {
            if (datasetsById.has(fid)) return fid;
          }
        }
      }
      // fallback
      return sortedFiles.length > 0 ? sortedFiles[0].id : null;
    })();
    if (!selectedFileId && firstFileId) setSelectedFileId(firstFileId);
  }, [selectedFileId, sortedFiles, sidebarItems, folders, datasetsById]);

  const createFolder = () => {
    const name = window.prompt('Folder name');
    if (!name) return;
    const folderId = `folder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const folderName = name.trim();
    if (!folderName) return;
    setFolders((prev) => ({
      ...prev,
      [folderId]: { id: folderId, name: folderName, expanded: true, fileIds: [] },
    }));
    setSidebarItems((prevItems) => [{ kind: 'folder', folderId } as SidebarItem, ...prevItems]);
  };

  const toggleFolder = (folderId: string) => {
    setFolders((prev) => {
      const folder = prev[folderId];
      if (!folder) return prev;
      return { ...prev, [folderId]: { ...folder, expanded: !folder.expanded } };
    });
  };

  const removeFolder = (folderId: string) => {
    const folder = folders[folderId];
    if (!folder) return;
    const ok = window.confirm(`Delete folder "${folder.name}"? Files will be moved back to root.`);
    if (!ok) return;

    const movedIds = folder.fileIds.filter((id) => datasetsById.has(id));

    setFolders((prev) => {
      const next = { ...prev };
      delete next[folderId];
      return next;
    });
    setSidebarItems((prevItems) => {
      const nextItems = prevItems.filter((it) => !(it.kind === 'folder' && it.folderId === folderId));
      return [...nextItems, ...movedIds.map((id) => ({ kind: 'file', datasetId: id } as SidebarItem))];
    });
  };

  const deleteFile = async (datasetId: string) => {
    const dataset = datasetsById.get(datasetId);
    const label = dataset?.name || 'this file';
    const ok = window.confirm(`Delete "${label}"?`);
    if (!ok) return;

    await datasetService.deleteDataset(datasetId);
    await queryClient.invalidateQueries({ queryKey: ['datasets'] });
    await queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
    await queryClient.invalidateQueries({ queryKey: ['datasetPreview', datasetId] });
  };

  const moveFileToFolder = (datasetId: string, targetFolderId: string) => {
    setFolders((prevFolders) => {
      const target = prevFolders[targetFolderId];
      if (!target) return prevFolders;

      const nextFolders: Record<string, Folder> = { ...prevFolders };
      for (const [fid, f] of Object.entries(nextFolders)) {
        if (f.fileIds.includes(datasetId)) {
          nextFolders[fid] = { ...f, fileIds: f.fileIds.filter((id) => id !== datasetId) };
        }
      }

      nextFolders[targetFolderId] = {
        ...target,
        expanded: true,
        fileIds: [...target.fileIds.filter((id) => id !== datasetId), datasetId],
      };

      return nextFolders;
    });
    setSidebarItems((prevItems) => prevItems.filter((it) => !(it.kind === 'file' && it.datasetId === datasetId)));
  };

  const moveFileToRoot = (datasetId: string, insertIndex?: number) => {
    setFolders((prevFolders) => {
      const nextFolders: Record<string, Folder> = { ...prevFolders };
      for (const [fid, f] of Object.entries(nextFolders)) {
        if (f.fileIds.includes(datasetId)) {
          nextFolders[fid] = { ...f, fileIds: f.fileIds.filter((id) => id !== datasetId) };
        }
      }
      return nextFolders;
    });
    setSidebarItems((prevItems) => {
      const without = prevItems.filter((it) => !(it.kind === 'file' && it.datasetId === datasetId));
      const idx = typeof insertIndex === 'number' ? Math.max(0, Math.min(without.length, insertIndex)) : without.length;
      return [...without.slice(0, idx), { kind: 'file', datasetId } as SidebarItem, ...without.slice(idx)];
    });
  };

  const reorderTopLevel = (dragIndex: number, dropIndex: number) => {
    setSidebarItems((prev) => {
      if (dragIndex === dropIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
  };

  const reorderFilesInFolder = (folderId: string, dragFileId: string, dropFileId: string) => {
    setFolders((prev) => {
      const folder = prev[folderId];
      if (!folder) return prev;
      const ids = [...folder.fileIds];
      const from = ids.indexOf(dragFileId);
      const to = ids.indexOf(dropFileId);
      if (from === -1 || to === -1) return prev;
      ids.splice(from, 1);
      ids.splice(to, 0, dragFileId);
      return { ...prev, [folderId]: { ...folder, fileIds: ids } };
    });
  };

  const { data: selectedDataset, isLoading: selectedDatasetLoading } = useQuery<DatasetDetail>({
    queryKey: ['dataset', selectedFileId],
    queryFn: () => datasetService.getDatasetById(selectedFileId!),
    enabled: !!selectedFileId,
  });

  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ['datasetPreview', selectedFileId],
    queryFn: () => datasetService.getDatasetPreview(selectedFileId!, 20),
    enabled: !!selectedFileId,
    retry: false,
  });

  const rows = previewData?.rows || [];
  const columns = normalizeColumns(selectedDataset?.schema_info?.columns, previewData?.columns, rows);
  const totalRows = selectedDataset?.row_count ?? previewData?.total_rows ?? 0;
  const selectedFileType = getFileTypeFromFilename(selectedDataset?.original_filename);
  const isLoading = datasetsLoading || (selectedFileId ? selectedDatasetLoading : false) || (selectedFileId ? previewLoading : false);

  // Debug logging for scroll containers
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!previewData) return; // Wait for data to load
    if (activeTab === 'schema' && sampleTableRef.current && rows.length > 0) {
      const container = sampleTableRef.current;
      const table = container.querySelector('table');
      console.log('=== SAMPLE DATA TABLE DEBUG ===');
      console.log('Container scrollWidth:', container.scrollWidth);
      console.log('Container clientWidth:', container.clientWidth);
      console.log('Container offsetWidth:', container.offsetWidth);
      console.log('Table width:', table?.offsetWidth);
      console.log('Table scrollWidth:', table?.scrollWidth);
      console.log('Columns count:', columns.length);
      console.log('Should scroll:', container.scrollWidth > container.clientWidth);
      console.log('Container overflow-x:', window.getComputedStyle(container).overflowX);
      console.log('Container styles:', {
        overflowX: container.style.overflowX,
        overflowY: container.style.overflowY,
        padding: container.style.padding
      });
    }
    
    if (activeTab === 'preview' && previewTableRef.current && rows.length > 0) {
      const container = previewTableRef.current;
      const table = container.querySelector('table');
      console.log('=== PREVIEW TABLE DEBUG ===');
      console.log('Container scrollWidth:', container.scrollWidth);
      console.log('Container clientWidth:', container.clientWidth);
      console.log('Container offsetWidth:', container.offsetWidth);
      console.log('Table width:', table?.offsetWidth);
      console.log('Table scrollWidth:', table?.scrollWidth);
      console.log('Columns count:', columns.length);
      console.log('Should scroll:', container.scrollWidth > container.clientWidth);
      console.log('Container overflow-x:', window.getComputedStyle(container).overflowX);
      console.log('Container styles:', {
        overflowX: container.style.overflowX,
        overflowY: container.style.overflowY,
        padding: container.style.padding
      });
    }
  }, [activeTab, rows, columns]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ width: '40px', height: '40px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex' }}>
      {/* Left Sidebar - Files Navigator */}
      <div style={{
        width: '280px',
        backgroundColor: 'white',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0
      }}>
        <div style={{ padding: '20px 20px 16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <button
            onClick={() => navigate('/databases')}
            style={{
              background: 'none',
              border: 'none',
              color: '#4f46e5',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0',
              marginBottom: '8px'
            }}
          >
            ← Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              FILES ({sortedFiles.length})
            </div>
            <button
              onClick={createFolder}
              style={{
                background: 'none',
                border: 'none',
                color: '#4f46e5',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                letterSpacing: '0.03em',
              }}
              title="Create folder"
            >
              + Create folder
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sortedFiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
              <div style={{ fontSize: '14px' }}>No files found</div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dragging = sidebarDndRef.current.dragging;
                if (!dragging) return;
                if (dragging.kind === 'file') {
                  moveFileToRoot(dragging.datasetId);
                }
                if (dragging.kind === 'folder') {
                  // dropping folder on empty space keeps order
                }
                sidebarDndRef.current.dragging = null;
              }}
            >
              {sidebarItems.map((item, topIndex) => {
                if (item.kind === 'folder') {
                  const folder = folders[item.folderId];
                  if (!folder) return null;
                  return (
                    <div key={item.folderId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <div
                        draggable
                        onDragStart={() => {
                          sidebarDndRef.current.dragging = { kind: 'folder', folderId: item.folderId };
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const dragging = sidebarDndRef.current.dragging;
                          if (!dragging) return;
                          if (dragging.kind === 'folder') {
                            const dragIndex = sidebarItems.findIndex((it) => it.kind === 'folder' && it.folderId === dragging.folderId);
                            const dropIndex = topIndex;
                            if (dragIndex !== -1) reorderTopLevel(dragIndex, dropIndex);
                          }
                          if (dragging.kind === 'file') {
                            moveFileToFolder(dragging.datasetId, item.folderId);
                          }
                          sidebarDndRef.current.dragging = null;
                        }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          padding: '10px 16px',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}
                          onClick={() => toggleFolder(item.folderId)}
                        >
                          <span style={{ color: '#64748b', fontSize: '12px', width: '14px' }}>{folder.expanded ? '▾' : '▸'}</span>
                          <span style={{ fontSize: '16px' }}>📁</span>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: '#334155'
                            }}>
                              {folder.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{folder.fileIds.length} file{folder.fileIds.length !== 1 ? 's' : ''}</div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFolder(item.folderId);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: '6px'
                          }}
                          title="Delete folder"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f1f5f9';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          -
                        </button>
                      </div>

                      {folder.expanded && folder.fileIds.length > 0 && (
                        <div style={{ paddingLeft: '28px', paddingBottom: '6px' }}>
                          {folder.fileIds.map((datasetId) => {
                            const dataset = datasetsById.get(datasetId);
                            if (!dataset) return null;
                            const fileType = getFileTypeFromFilename(dataset.original_filename);
                            const isSelected = selectedFileId === dataset.id;
                            return (
                              <div
                                key={dataset.id}
                                draggable
                                onDragStart={() => {
                                  sidebarDndRef.current.dragging = { kind: 'file', datasetId: dataset.id, from: { kind: 'folder', folderId: item.folderId } };
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const dragging = sidebarDndRef.current.dragging;
                                  if (!dragging) return;
                                  if (dragging.kind === 'file') {
                                    if (dragging.datasetId === dataset.id) return;
                                    // If same folder, reorder. Otherwise move into folder then reorder is not needed.
                                    if (dragging.from.kind === 'folder' && dragging.from.folderId === item.folderId) {
                                      reorderFilesInFolder(item.folderId, dragging.datasetId, dataset.id);
                                    } else {
                                      moveFileToFolder(dragging.datasetId, item.folderId);
                                    }
                                  }
                                  sidebarDndRef.current.dragging = null;
                                }}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  background: isSelected ? '#eff6ff' : 'transparent',
                                  color: isSelected ? '#4f46e5' : '#475569',
                                  fontWeight: isSelected ? 600 : 400,
                                }}
                                onClick={() => setSelectedFileId(dataset.id)}
                                onMouseEnter={(e) => {
                                  if (!isSelected) (e.currentTarget as any).style.backgroundColor = '#f8fafc';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) (e.currentTarget as any).style.backgroundColor = 'transparent';
                                }}
                              >
                                <span style={{ fontSize: '16px' }}>{getFileIcon(fileType)}</span>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                                    {dataset.name}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteFile(dataset.id);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    borderRadius: '6px'
                                  }}
                                  title="Delete file"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  -
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // top-level file
                const dataset = datasetsById.get(item.datasetId);
                if (!dataset) return null;
                const fileType = getFileTypeFromFilename(dataset.original_filename);
                const isSelected = selectedFileId === dataset.id;
                return (
                  <div
                    key={dataset.id}
                    draggable
                    onDragStart={() => {
                      sidebarDndRef.current.dragging = { kind: 'file', datasetId: dataset.id, from: { kind: 'root' } };
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragging = sidebarDndRef.current.dragging;
                      if (!dragging) return;
                      if (dragging.kind === 'folder') {
                        const dragIndex = sidebarItems.findIndex((it) => it.kind === 'folder' && it.folderId === dragging.folderId);
                        const dropIndex = topIndex;
                        if (dragIndex !== -1) reorderTopLevel(dragIndex, dropIndex);
                      }
                      if (dragging.kind === 'file') {
                        if (dragging.datasetId === dataset.id) return;
                        const dragIndex = sidebarItems.findIndex((it) => it.kind === 'file' && it.datasetId === dragging.datasetId);
                        const dropIndex = topIndex;
                        if (dragIndex !== -1) reorderTopLevel(dragIndex, dropIndex);
                        // ensure it's in root
                        moveFileToRoot(dragging.datasetId, dropIndex);
                      }
                      sidebarDndRef.current.dragging = null;
                    }}
                    style={{
                      width: '100%',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      border: 'none',
                      borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent',
                      padding: '10px 20px 10px 17px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      transition: 'background-color 0.2s',
                      fontSize: '14px',
                      color: isSelected ? '#4f46e5' : '#475569',
                      fontWeight: isSelected ? 600 : 400
                    }}
                    onClick={() => setSelectedFileId(dataset.id)}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as any).style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as any).style.backgroundColor = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{getFileIcon(fileType)}</span>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dataset.name}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(dataset.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        borderRadius: '6px'
                      }}
                      title="Delete file"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      -
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>
        <div style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '20px 32px'
        }}>
          {selectedDataset ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: '#eff6ff',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    {getFileIcon(selectedFileType)}
                  </div>
                  <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                      File Uploads
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
                        Active
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button style={{
                    backgroundColor: 'white',
                    color: '#4f46e5',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    🔄 Sync Now
                  </button>
                  <button style={{
                    backgroundColor: 'white',
                    color: '#64748b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    ⚙️ Settings
                  </button>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <span style={{ fontSize: '16px' }}>📋</span>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                    {selectedDataset.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {totalRows.toLocaleString()} rows · {columns.length} columns · {getFileTypeName(selectedFileType)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '32px', borderBottom: '2px solid #f1f5f9' }}>
                <button
                  onClick={() => setActiveTab('schema')}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'schema' ? '2px solid #4f46e5' : '2px solid transparent',
                    padding: '0 0 12px 0',
                    marginBottom: '-2px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: activeTab === 'schema' ? '#4f46e5' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  Schema
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'preview' ? '2px solid #4f46e5' : '2px solid transparent',
                    padding: '0 0 12px 0',
                    marginBottom: '-2px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: activeTab === 'preview' ? '#4f46e5' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  Data Preview
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Select a file
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                Choose a file from the sidebar to view its schema and data
              </p>
            </div>
          )}
        </div>

        {selectedDataset && (
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: '24px', paddingBottom: '24px', minWidth: 0 }}>
            {activeTab === 'schema' && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                marginLeft: '32px',
                marginRight: '32px',
                width: 'calc(100% - 64px)',
                maxWidth: 'calc(100% - 64px)',
                minWidth: 0,
                boxSizing: 'border-box'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: schemaNameWidth + schemaTypeWidth + 12 }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `${schemaNameWidth}px 12px ${schemaTypeWidth}px`,
                      padding: '14px 20px',
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      fontWeight: 600,
                      fontSize: '12px',
                      color: '#64748b',
                      alignItems: 'center'
                    }}>
                      <div>Column</div>
                      <div
                        onMouseDown={(e) => {
                          resizeRef.current.dragging = true;
                          resizeRef.current.startX = e.clientX;
                          resizeRef.current.startWidth = schemaNameWidth;
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        style={{
                          width: '12px',
                          height: '20px',
                          cursor: 'col-resize',
                          borderLeft: '1px solid #e2e8f0',
                          borderRight: '1px solid #e2e8f0',
                          justifySelf: 'stretch'
                        }}
                        title="Drag to resize"
                      />
                      <div>Type</div>
                    </div>

                    {columns.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No columns found
                      </div>
                    ) : (
                      columns.map((column: any, index: number) => (
                        <div
                          key={column.sourceKey || index}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `${schemaNameWidth}px 12px ${schemaTypeWidth}px`,
                            padding: '14px 20px',
                            borderBottom: index < columns.length - 1 ? '1px solid #f1f5f9' : 'none',
                            fontSize: '14px',
                            alignItems: 'center'
                          }}
                        >
                          <div
                            title={String(column.sourceKey ?? column.name)}
                            style={{
                              fontWeight: 500,
                              color: '#1e293b',
                              fontFamily: 'monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {column.name}
                          </div>
                          <div />
                          <div>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor:
                                (column.type?.includes('int') || column.type?.includes('INT') || column.type?.includes('number')) ? '#dbeafe' :
                                (column.type?.includes('varchar') || column.type?.includes('VARCHAR') || column.type?.includes('text') || column.type?.includes('TEXT') || column.type?.includes('string') || column.type?.includes('STRING')) ? '#fce7f3' :
                                (column.type?.includes('decimal') || column.type?.includes('DECIMAL') || column.type?.includes('float') || column.type?.includes('FLOAT')) ? '#d1fae5' :
                                (column.type?.includes('timestamp') || column.type?.includes('TIMESTAMP') || column.type?.includes('date') || column.type?.includes('DATE')) ? '#fef3c7' :
                                '#f1f5f9',
                              color:
                                (column.type?.includes('int') || column.type?.includes('INT') || column.type?.includes('number')) ? '#1e40af' :
                                (column.type?.includes('varchar') || column.type?.includes('VARCHAR') || column.type?.includes('text') || column.type?.includes('TEXT') || column.type?.includes('string') || column.type?.includes('STRING')) ? '#be185d' :
                                (column.type?.includes('decimal') || column.type?.includes('DECIMAL') || column.type?.includes('float') || column.type?.includes('FLOAT')) ? '#065f46' :
                                (column.type?.includes('timestamp') || column.type?.includes('TIMESTAMP') || column.type?.includes('date') || column.type?.includes('DATE')) ? '#92400e' :
                                '#475569'
                            }}>
                              {column.type || 'unknown'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {rows.length > 0 && (
                  <>
                    <div style={{
                      padding: '16px 20px',
                      borderTop: '2px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#64748b'
                    }}>
                      <span>⏱️</span>
                      Sample Data (first 20 rows)
                    </div>
                    <div 
                      ref={sampleTableRef}
                      onMouseDown={(e) => {
                        const el = sampleTableRef.current;
                        if (!el) return;
                        dragScrollRef.current.dragging = true;
                        dragScrollRef.current.startX = e.clientX;
                        dragScrollRef.current.startScrollLeft = el.scrollLeft;
                        dragScrollRef.current.el = el;
                        el.style.cursor = 'grabbing';
                        e.preventDefault();
                      }}
                      style={{ 
                      overflowX: 'scroll',
                      overflowY: 'hidden',
                      WebkitOverflowScrolling: 'touch' as any,
                      borderTop: '1px solid #f1f5f9',
                      width: '100%',
                      maxWidth: '100%',
                      scrollbarGutter: 'stable' as any,
                      cursor: 'grab'
                    }}>
                      <div style={{ display: 'inline-block', width: 'max-content', minWidth: '100%' }}>
                        <table style={{ borderCollapse: 'collapse', tableLayout: 'auto', width: '100%' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                              {columns.map((col: any, idx: number) => (
                                <th key={idx} style={{
                                  padding: '12px 20px',
                                  textAlign: 'left',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#64748b',
                                  borderBottom: '1px solid #e2e8f0',
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'monospace',
                                  minWidth: '140px'
                                }}>
                                  {col.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 20).map((row: any, rowIdx: number) => (
                              <tr key={rowIdx}>
                                {columns.map((col: any, colIdx: number) => {
                                  const colKey = col.sourceKey;
                                  return (
                                    <td key={colIdx} style={{
                                      padding: '12px 20px',
                                      fontSize: '13px',
                                      color: '#1e293b',
                                      borderBottom: rowIdx < Math.min(rows.length, 20) - 1 ? '1px solid #f1f5f9' : 'none',
                                      whiteSpace: 'nowrap',
                                      minWidth: '140px'
                                    }}>
                                      {row[colKey] !== null && row[colKey] !== undefined ? String(row[colKey]) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'preview' && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                marginLeft: '32px',
                marginRight: '32px',
                width: 'calc(100% - 64px)',
                maxWidth: 'calc(100% - 64px)',
                minWidth: 0,
                boxSizing: 'border-box'
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 600, color: '#64748b' }}>
                  Data Preview (first 20 rows)
                </div>
                {rows.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    No data available
                  </div>
                ) : (
                  <div 
                    ref={previewTableRef}
                    onMouseDown={(e) => {
                      const el = previewTableRef.current;
                      if (!el) return;
                      dragScrollRef.current.dragging = true;
                      dragScrollRef.current.startX = e.clientX;
                      dragScrollRef.current.startScrollLeft = el.scrollLeft;
                      dragScrollRef.current.el = el;
                      el.style.cursor = 'grabbing';
                      e.preventDefault();
                    }}
                    style={{ 
                    overflowX: 'scroll',
                    overflowY: 'hidden',
                    WebkitOverflowScrolling: 'touch' as any,
                    borderTop: '1px solid #f1f5f9',
                    paddingBottom: '20px',
                    width: '100%',
                    maxWidth: '100%',
                    scrollbarGutter: 'stable' as any,
                    cursor: 'grab'
                  }}>
                    <div style={{ display: 'inline-block', width: 'max-content', minWidth: '100%' }}>
                      <table style={{ borderCollapse: 'collapse', tableLayout: 'auto', width: '100%' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            {columns.map((col: any, idx: number) => (
                              <th key={idx} style={{
                                padding: '12px 20px',
                                textAlign: 'left',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#64748b',
                                borderBottom: '1px solid #e2e8f0',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                minWidth: '140px'
                              }}>
                                {col.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 20).map((row: any, rowIdx: number) => (
                            <tr key={rowIdx}>
                              {columns.map((col: any, colIdx: number) => {
                                const colKey = col.sourceKey;
                                return (
                                  <td key={colIdx} style={{
                                    padding: '12px 20px',
                                    fontSize: '13px',
                                    color: '#1e293b',
                                    borderBottom: rowIdx < Math.min(rows.length, 20) - 1 ? '1px solid #f1f5f9' : 'none',
                                    whiteSpace: 'nowrap',
                                    minWidth: '140px'
                                  }}>
                                    {row[colKey] !== null && row[colKey] !== undefined ? String(row[colKey]) : '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
