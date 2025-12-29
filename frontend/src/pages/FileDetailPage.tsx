import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { datasetService } from '../services/datasetService';
import type { DatasetDetail } from '../types';

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

export const FileDetailPage: React.FC = () => {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
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

  // Fetch dataset details
  const { data: dataset, isLoading: fileLoading } = useQuery<DatasetDetail>({
    queryKey: ['dataset', fileId],
    queryFn: () => datasetService.getDatasetById(fileId!),
    enabled: !!fileId,
  });

  // Fetch preview data
  const { data: previewData, isLoading: dataLoading } = useQuery({
    queryKey: ['datasetPreview', fileId],
    queryFn: () => datasetService.getDatasetPreview(fileId!, 20),
    enabled: !!fileId,
    retry: false,
  });

  const isLoading = fileLoading || dataLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ width: '40px', height: '40px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!dataset) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '32px 48px' }}>
        <div style={{ textAlign: 'center', padding: '64px 32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            File not found
          </h2>
          <button
            onClick={() => navigate('/databases/file-uploads')}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Back to File Uploads
          </button>
        </div>
      </div>
    );
  }

  const rows = previewData?.rows || [];
  const columns = normalizeColumns(dataset.schema_info?.columns, previewData?.columns, rows);
  const totalRows = dataset.row_count ?? previewData?.total_rows ?? 0;
  const fileType = getFileTypeFromFilename(dataset.original_filename);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Left Sidebar - Columns List */}
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
        {/* Back Button */}
        <div style={{ padding: '20px 20px 16px' }}>
          <button
            onClick={() => navigate('/databases/file-uploads')}
            style={{
              background: 'none',
              border: 'none',
              color: '#4f46e5',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0'
            }}
          >
            ← Back to Files
          </button>
        </div>

        {/* Columns Header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #e2e8f0',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.5px'
          }}>
            COLUMNS ({columns.length})
          </div>
        </div>

        {/* Columns List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {columns.map((column: any, index: number) => (
            <div
              key={column.name || index}
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid #f1f5f9',
                cursor: 'default'
              }}
            >
              <div style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#1e293b',
                marginBottom: '4px',
                fontFamily: 'monospace'
              }}>
                {column.name}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {column.type || 'unknown'}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Stats */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
            Total Rows
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
            {totalRows.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '20px 32px'
        }}>
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
                {getFileIcon(fileType)}
              </div>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                  {dataset.name}
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

          {/* File Info Bar */}
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
                {dataset.original_filename || dataset.name}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {totalRows.toLocaleString()} rows · {columns.length} columns · {getFileTypeName(fileType)}
              </div>
            </div>
          </div>

          {/* Tabs */}
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
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', minWidth: 0 }}>
          {activeTab === 'schema' && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: schemaNameWidth + schemaTypeWidth + 12 }}>
                  {/* Schema Table Header */}
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

                  {/* Schema Table Body */}
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

              {/* Sample Data Section */}
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
                      maxWidth: '100%',
                      WebkitOverflowScrolling: 'touch' as any,
                      scrollbarGutter: 'stable' as any,
                      cursor: 'grab',
                      borderTop: '1px solid #f1f5f9'
                    }}
                  >
                    <div style={{ display: 'inline-block', width: 'max-content', minWidth: '100%' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', whiteSpace: 'nowrap' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            {columns.map((col: any, idx: number) => (
                              <th key={idx} style={{
                                padding: '12px 16px',
                                textAlign: 'left',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#64748b',
                                borderBottom: '1px solid #e2e8f0',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                minWidth: '180px'
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
                                    padding: '12px 16px',
                                    fontSize: '13px',
                                    color: '#1e293b',
                                    borderBottom: rowIdx < Math.min(rows.length, 20) - 1 ? '1px solid #f1f5f9' : 'none',
                                    whiteSpace: 'nowrap',
                                    minWidth: '180px'
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
              overflow: 'hidden'
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
                    maxWidth: '100%',
                    WebkitOverflowScrolling: 'touch' as any,
                    scrollbarGutter: 'stable' as any,
                    cursor: 'grab',
                    borderTop: '1px solid #f1f5f9'
                  }}
                >
                  <div style={{ display: 'inline-block', width: 'max-content', minWidth: '100%' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                          {columns.map((col: any, idx: number) => (
                            <th key={idx} style={{
                              padding: '12px 16px',
                              textAlign: 'left',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#64748b',
                              borderBottom: '1px solid #e2e8f0',
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                              minWidth: '180px'
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
                                  padding: '12px 16px',
                                  fontSize: '13px',
                                  color: '#1e293b',
                                  borderBottom: rowIdx < Math.min(rows.length, 20) - 1 ? '1px solid #f1f5f9' : 'none',
                                  whiteSpace: 'nowrap',
                                  minWidth: '180px'
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
      </div>
    </div>
  );
};
