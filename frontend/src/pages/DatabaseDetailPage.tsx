import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { connectionService } from '../services/connectionService';
import type { Connection } from '../types';

// Database icon mapping
const getSourceIcon = (sourceType: string) => {
  switch (sourceType) {
    case 'postgresql':
      return '🐘';
    case 'mysql':
      return '🐬';
    case 'mongodb':
      return '🍃';
    default:
      return '🔌';
  }
};

function formatRelativeTime(iso?: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`;
}

export const DatabaseDetailPage: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<{ db: string; table: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'schema' | 'preview'>('schema');
  const [isSyncing, setIsSyncing] = useState(false);
  const sampleTableRef = React.useRef<HTMLDivElement>(null);
  const previewTableRef = React.useRef<HTMLDivElement>(null);
  const dragScrollRef = React.useRef<{ dragging: boolean; startX: number; startScrollLeft: number; el: HTMLDivElement | null }>({
    dragging: false,
    startX: 0,
    startScrollLeft: 0,
    el: null,
  });

  // Fetch connection details
  const { data: connection, isLoading: connectionLoading } = useQuery<Connection>({
    queryKey: ['connection', connectionId],
    queryFn: () => connectionService.getConnectionById(connectionId!),
    enabled: !!connectionId,
  });

  // Fetch databases with tables
  const { data: databases = {}, isLoading: databasesLoading } = useQuery<Record<string, string[]>>({
    queryKey: ['databases', connectionId],
    queryFn: () => connectionService.getDatabases(connectionId!),
    enabled: !!connectionId,
  });

  // Fetch table data when a table is selected
  const { data: tableData, isLoading: tableDataLoading } = useQuery({
    queryKey: ['tableData', connectionId, selectedTable?.db, selectedTable?.table],
    queryFn: () => connectionService.queryData(
      connectionId!,
      selectedTable!.table,
      5,
      0,
      selectedTable!.db
    ),
    enabled: !!connectionId && !!selectedTable,
    retry: false,
  });

  const toggleDatabase = (dbName: string) => {
    setExpandedDatabases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dbName)) {
        newSet.delete(dbName);
      } else {
        newSet.add(dbName);
      }
      return newSet;
    });
  };

  // Auto-expand first database and select first table on load
  React.useEffect(() => {
    if (databases && Object.keys(databases).length > 0 && !selectedTable) {
      const firstDb = Object.keys(databases).sort()[0];
      const firstTable = databases[firstDb]?.[0];
      if (firstDb && firstTable) {
        setExpandedDatabases(new Set([firstDb]));
        setSelectedTable({ db: firstDb, table: firstTable });
      }
    }
  }, [databases, selectedTable]);

  React.useEffect(() => {
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

  const isLoading = connectionLoading || databasesLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ width: '40px', height: '40px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!connection) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '32px 48px' }}>
        <div style={{ textAlign: 'center', padding: '64px 32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            Connection not found
          </h2>
          <button
            onClick={() => navigate('/databases')}
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
            Back to Databases
          </button>
        </div>
      </div>
    );
  }

  const databaseNames = Object.keys(databases).sort();
  const totalTables = Object.values(databases).reduce((acc, tables) => acc + tables.length, 0);
  
  const columns = tableData?.columns || [];
  const rows = tableData?.data || [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex' }}>
      {/* Left Sidebar - Database & Tables Navigator */}
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
        {/* Header */}
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
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TABLES ({totalTables})
          </div>
        </div>

        {/* Tables List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {databaseNames.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
              <div style={{ fontSize: '14px' }}>No tables found</div>
            </div>
          ) : (
            databaseNames.map((dbName) => {
              const tables = databases[dbName] || [];
              const isExpanded = expandedDatabases.has(dbName);
              
              return (
                <div key={dbName}>
                  {/* Database/Schema Header - Only show if multiple databases */}
                  <button
                    onClick={() => toggleDatabase(dbName)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #f1f5f9',
                      padding: '12px 20px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#475569'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span aria-hidden>📁</span>
                      <span>{dbName}</span>
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>

                  {/* Tables List */}
                  {isExpanded && (
                    <div>
                      {tables.length === 0 ? (
                        <div style={{
                          fontSize: '12px',
                          color: '#94a3b8',
                          padding: '12px 20px',
                          fontStyle: 'italic'
                        }}>
                          No tables
                        </div>
                      ) : (
                        tables.map((table) => {
                          const isSelected = selectedTable?.db === dbName && selectedTable?.table === table;
                          return (
                            <button
                              key={table}
                              onClick={() => setSelectedTable({ db: dbName, table })}
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
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <span style={{ fontSize: '14px' }}>📋</span>
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {table}
                                </div>
                                {/* Could show row count here if available */}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
          {selectedTable ? (
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
                    {getSourceIcon(connection?.source_type || 'postgresql')}
                  </div>
                  <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                      {connection?.name || 'Database'}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
                        Synced {formatRelativeTime((connection as any)?.last_synced_at)}
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
                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  disabled={isSyncing}
                  onClick={async () => {
                    if (!connectionId) return;
                    setIsSyncing(true);
                    try {
                      await connectionService.syncConnection(connectionId);
                      await queryClient.invalidateQueries({ queryKey: ['databases', connectionId] });
                      await queryClient.invalidateQueries({ queryKey: ['connectionStats', connectionId] });
                      await queryClient.invalidateQueries({ queryKey: ['tableData', connectionId] });
                    } finally {
                      setIsSyncing(false);
                    }
                  }}>
                    🔄 {isSyncing ? 'Syncing…' : 'Sync Now'}
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

              {/* Table Info Bar */}
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
                    {selectedTable.table}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {tableData && typeof (tableData as any)?.total_rows === 'number'
                      ? `${(tableData as any).total_rows} rows`
                      : (tableDataLoading ? 'Loading...' : `${rows.length} rows`)}
                    {' '}· {columns.length} columns
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
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Select a table
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                Choose a table from the sidebar to view its schema and data
              </p>
            </div>
          )}
        </div>

        {/* Content */}
        {selectedTable && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', minWidth: 0 }}>
            {activeTab === 'schema' && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                {/* Schema Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 180px',
                  padding: '14px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '12px',
                  color: '#64748b'
                }}>
                  <div>#</div>
                  <div>Column</div>
                  <div>Type</div>
                </div>

                {/* Schema Table Body */}
                {tableDataLoading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading schema...
                  </div>
                ) : columns.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    No columns found
                  </div>
                ) : (
                  columns.map((column: any, index: number) => (
                    <div
                      key={column.name || index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 180px',
                        padding: '14px 20px',
                        borderBottom: index < columns.length - 1 ? '1px solid #f1f5f9' : 'none',
                        fontSize: '14px'
                      }}
                    >
                      <div style={{ color: '#94a3b8' }}>{index + 1}</div>
                      <div style={{ fontWeight: 500, color: '#1e293b', fontFamily: 'monospace' }}>
                        {column.name || column}
                      </div>
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: 
                            (column.type?.includes('int') || column.type?.includes('INT')) ? '#dbeafe' :
                            (column.type?.includes('varchar') || column.type?.includes('VARCHAR') || column.type?.includes('text') || column.type?.includes('TEXT')) ? '#fce7f3' :
                            (column.type?.includes('decimal') || column.type?.includes('DECIMAL') || column.type?.includes('float') || column.type?.includes('FLOAT')) ? '#d1fae5' :
                            (column.type?.includes('timestamp') || column.type?.includes('TIMESTAMP') || column.type?.includes('date') || column.type?.includes('DATE')) ? '#fef3c7' :
                            '#f1f5f9',
                          color:
                            (column.type?.includes('int') || column.type?.includes('INT')) ? '#1e40af' :
                            (column.type?.includes('varchar') || column.type?.includes('VARCHAR') || column.type?.includes('text') || column.type?.includes('TEXT')) ? '#be185d' :
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

                {/* Sample Data Section */}
                {!tableDataLoading && rows.length > 0 && (
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
                      Sample Data (first 5 rows)
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
                              <th style={{
                                padding: '12px 16px',
                                textAlign: 'left',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#64748b',
                                borderBottom: '1px solid #e2e8f0',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                width: '60px',
                                minWidth: '60px'
                              }}>
                                #
                              </th>
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
                                  {col.name || col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 5).map((row: any, rowIdx: number) => (
                              <tr key={rowIdx}>
                                <td style={{
                                  padding: '12px 16px',
                                  fontSize: '13px',
                                  color: '#64748b',
                                  borderBottom: rowIdx < Math.min(rows.length, 5) - 1 ? '1px solid #f1f5f9' : 'none',
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'monospace',
                                  width: '60px',
                                  minWidth: '60px'
                                }}>
                                  {rowIdx + 1}
                                </td>
                              {columns.map((col: any, colIdx: number) => {
                                  const colName = col.name || col;
                                  return (
                                    <td key={colIdx} style={{
                                      padding: '12px 16px',
                                      fontSize: '13px',
                                      color: '#1e293b',
                                      borderBottom: rowIdx < Math.min(rows.length, 5) - 1 ? '1px solid #f1f5f9' : 'none',
                                      whiteSpace: 'nowrap',
                                      minWidth: '180px'
                                    }}>
                                      {row[colName] !== null && row[colName] !== undefined ? String(row[colName]) : '-'}
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
                  Data Preview (first 5 rows)
                </div>
                {tableDataLoading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading data...
                  </div>
                ) : rows.length === 0 ? (
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
                            <th style={{
                              padding: '12px 16px',
                              textAlign: 'left',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#64748b',
                              borderBottom: '1px solid #e2e8f0',
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                              width: '60px',
                              minWidth: '60px'
                            }}>
                              #
                            </th>
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
                                {col.name || col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 5).map((row: any, rowIdx: number) => (
                            <tr key={rowIdx}>
                              <td style={{
                                padding: '12px 16px',
                                fontSize: '13px',
                                color: '#64748b',
                                borderBottom: rowIdx < Math.min(rows.length, 5) - 1 ? '1px solid #f1f5f9' : 'none',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                width: '60px',
                                minWidth: '60px'
                              }}>
                                {rowIdx + 1}
                              </td>
                              {columns.map((col: any, colIdx: number) => {
                                const colName = col.name || col;
                                return (
                                  <td key={colIdx} style={{
                                    padding: '12px 16px',
                                    fontSize: '13px',
                                    color: '#1e293b',
                                    borderBottom: rowIdx < Math.min(rows.length, 5) - 1 ? '1px solid #f1f5f9' : 'none',
                                    whiteSpace: 'nowrap',
                                    minWidth: '180px'
                                  }}>
                                    {row[colName] !== null && row[colName] !== undefined ? String(row[colName]) : '-'}
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
