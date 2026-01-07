import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { connectionService } from '../services/connectionService';
import { datasetService } from '../services/datasetService';
import type { Connection } from '../types';

// Database source type icons
const getSourceIcon = (sourceType: string) => {
  switch (sourceType) {
    case 'postgresql':
      return '🐘';
    case 'mysql':
      return '🐬';
    case 'mongodb':
      return '🍃';
    case 'salesforce':
      return '☁️';
    case 'manual':
      return '✍️';
    case 'csv':
    case 'excel':
    case 'json':
    case 'txt':
    case 'md':
    case 'mdx':
    case 'pdf':
      return '📁';
    default:
      return '🔌';
  }
};

// Get display name for source type
const getSourceTypeName = (sourceType: string) => {
  switch (sourceType) {
    case 'postgresql':
      return 'PostgreSQL';
    case 'mysql':
      return 'MySQL';
    case 'mongodb':
      return 'MongoDB';
    case 'salesforce':
      return 'Salesforce';
    case 'manual':
      return 'Manual Entry';
    case 'csv':
      return 'CSV File';
    case 'excel':
      return 'Excel File';
    case 'json':
      return 'JSON File';
    case 'txt':
      return 'Text File';
    case 'md':
      return 'Markdown File';
    case 'mdx':
      return 'MDX File';
    case 'pdf':
      return 'PDF File';
    default:
      return sourceType.toUpperCase();
  }
};

// Connection status badge
const StatusBadge: React.FC<{ status: 'synced' | 'syncing' | 'error' }> = ({ status }) => {
  const styles = {
    synced: {
      container: { display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '13px', fontWeight: 500 },
      dot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }
    },
    syncing: {
      container: { display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontSize: '13px', fontWeight: 500 },
      dot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }
    },
    error: {
      container: { display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '13px', fontWeight: 500 },
      dot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }
    }
  };

  const style = styles[status];
  const label = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing now...' : 'Error';

  return (
    <div style={style.container}>
      <div style={style.dot} />
      {label}
    </div>
  );
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

type ScheduleUnit = 'min' | 'hr' | 'day' | 'week';
function unitToSeconds(unit: ScheduleUnit): number {
  if (unit === 'min') return 60;
  if (unit === 'hr') return 3600;
  if (unit === 'day') return 86400;
  return 604800;
}

function secondsToBestUnit(seconds: number): { value: number; unit: ScheduleUnit } {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return { value: 1, unit: 'hr' };
  if (s % 604800 === 0) return { value: Math.max(1, Math.round(s / 604800)), unit: 'week' };
  if (s % 86400 === 0) return { value: Math.max(1, Math.round(s / 86400)), unit: 'day' };
  if (s % 3600 === 0) return { value: Math.max(1, Math.round(s / 3600)), unit: 'hr' };
  if (s % 60 === 0) return { value: Math.max(1, Math.round(s / 60)), unit: 'min' };
  if (s >= 86400) return { value: Math.max(1, Math.round(s / 86400)), unit: 'day' };
  if (s >= 3600) return { value: Math.max(1, Math.round(s / 3600)), unit: 'hr' };
  return { value: Math.max(1, Math.round(s / 60)), unit: 'min' };
}

// Database card component
const DatabaseCard: React.FC<{
  connection: Connection & { isAggregated?: boolean, aggregatedCount?: number },
  onClick: () => void,
  menuOpen: boolean,
  onToggleMenu: () => void,
  onCloseMenu: () => void,
  onSync?: () => void,
  onEdit?: () => void,
  onDelete?: () => void,
  draggable?: boolean,
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void,
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void,
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void,
}> = ({
  connection,
  onClick,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onSync,
  onEdit,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const isAggregated = connection.isAggregated;
  const isClickable = true; // All blocks are now clickable

  const { data: datasets } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
    enabled: isClickable && !!isAggregated,
    retry: false,
  });
  
  // Fetch real database stats for individual connections
  const { data: databases } = useQuery<Record<string, string[]>>({
    queryKey: ['databases', connection.id],
    queryFn: () => connectionService.getDatabases(connection.id),
    enabled: isClickable && !isAggregated,
    retry: false,
  });

  // Fetch connection stats (table count and row count) for database connections
  const { data: connectionStats, isLoading: statsLoading } = useQuery<{ total_tables: number; total_rows: number }>({
    queryKey: ['connectionStats', connection.id],
    queryFn: () => connectionService.getConnectionStats(connection.id),
    enabled: isClickable && !isAggregated,
    retry: false,
  });

  // Calculate real stats
  const stats = React.useMemo(() => {
    if (isAggregated) {
      const fileDatasets = (datasets || []).filter((d: any) => !!d?.original_filename);
      const totalRows = fileDatasets.reduce((acc: number, d: any) => acc + (Number(d?.row_count) || 0), 0);
      return {
        tables: fileDatasets.length,
        rows: totalRows,
        status: 'synced' as const,
        loading: false
      };
    }
    
    if (connectionStats) {
      return {
        tables: connectionStats.total_tables,
        rows: connectionStats.total_rows,
        status: 'synced' as const,
        loading: false
      };
    }
    
    if (databases) {
      const totalTables = Object.values(databases).reduce((acc, tables) => acc + tables.length, 0);
      return {
        tables: totalTables,
        rows: 0,
        status: 'synced' as const,
        loading: statsLoading
      };
    }
    
    return {
      tables: 0,
      rows: 0,
      status: 'synced' as const,
      loading: statsLoading
    };
  }, [databases, datasets, connectionStats, statsLoading, isAggregated, connection.aggregatedCount]);

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div
      draggable={!!draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
      backgroundColor: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '20px',
      cursor: isClickable ? 'pointer' : 'default',
      transition: 'all 0.2s',
      position: 'relative'
    }}
    onClick={isClickable ? onClick : undefined}
    onMouseEnter={(e) => {
      if (isClickable) {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        e.currentTarget.style.borderColor = '#cbd5e1';
      }
    }}
    onMouseLeave={(e) => {
      if (isClickable) {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = '#e2e8f0';
      }
    }}>
      {/* Three dots menu */}
      <button style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        background: 'none',
        border: 'none',
        fontSize: '20px',
        color: '#64748b',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: '4px'
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggleMenu();
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
        ⋯
      </button>

      {!isAggregated && menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '46px',
            right: '16px',
            width: '200px',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
            zIndex: 20,
            overflow: 'hidden'
          }}
        >
          {[
            { label: 'Sync', onClick: onSync },
            { label: 'Edit', onClick: onEdit },
            { label: 'Delete', onClick: onDelete, danger: true },
          ]
            .filter((i) => !!i.onClick)
            .map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.onClick?.();
                  onCloseMenu();
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: 'none',
                  background: 'white',
                  cursor: 'pointer',
                  color: item.danger ? '#dc2626' : '#0f172a',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
              >
                {item.label}
              </button>
            ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
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
          {getSourceIcon(connection.source_type)}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {connection.name}
            <span style={{ fontSize: '12px', color: '#4f46e5' }}>→</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>
            <span style={{ fontSize: '12px' }}>📊</span>
            {isAggregated 
              ? 'File Upload'
              : getSourceTypeName(connection.source_type)
            }
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '32px', marginBottom: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
            {stats.tables}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {isAggregated ? 'Files' : (connection.source_type === 'mongodb' ? 'Collections' : 'Tables')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
            {stats.loading ? '...' : (stats.rows > 0 ? formatNumber(stats.rows) : '-')}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Rows
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
        <StatusBadge status={stats.status} />
        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🕐</span>
          {formatRelativeTime((connection as any).last_synced_at)}
        </div>
      </div>
    </div>
  );
};

export const DatabasesListPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCreds, setEditCreds] = useState<Record<string, any>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [autoSyncValue, setAutoSyncValue] = useState<number>(1);
  const [autoSyncUnit, setAutoSyncUnit] = useState<ScheduleUnit>('hr');
  const [editTest, setEditTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });
  const [editItems, setEditItems] = useState<string[]>([]);
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const dragIdRef = useRef<string | null>(null);

  const ORDER_KEY = 'connections_order_v1';
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
  });

  useEffect(() => {
    const ids = connections.map((c) => c.id);
    setOrder((prev) => {
      const next = prev.filter((id) => ids.includes(id));
      for (const id of ids) {
        if (!next.includes(id)) next.push(id);
      }
      
      // Only update if order actually changed
      if (JSON.stringify(prev) === JSON.stringify(next)) {
        return prev;
      }
      
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [connections]);

  // Group connections by type
  const fileTypeConnections = connections.filter(conn => 
    ['csv', 'excel', 'json', 'txt', 'md', 'mdx', 'pdf'].includes(conn.source_type)
  );
  
  const mysqlConnections = connections.filter(conn => conn.source_type === 'mysql');
  const postgresConnections = connections.filter(conn => conn.source_type === 'postgresql');
  const mongoConnections = connections.filter(conn => conn.source_type === 'mongodb');
  const salesforceConnections = connections.filter(conn => conn.source_type === 'salesforce');

  // Create aggregated connections array
  const aggregatedConnections: Array<Connection & { isAggregated?: boolean, aggregatedCount?: number }> = [];

  // Always add "File Uploads" block (even if 0)
  aggregatedConnections.push({
    id: 'file-uploads-aggregate',
    name: 'File Uploads',
    source_type: 'csv',
    config: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    isAggregated: true,
    aggregatedCount: fileTypeConnections.length
  } as any);

  // Add individual database connections
  const orderedRealConnections = useMemo(() => {
    const real = [...mysqlConnections, ...postgresConnections, ...mongoConnections, ...salesforceConnections];
    const index = new Map(order.map((id, i) => [id, i]));
    return real.sort((a, b) => (index.get(a.id) ?? 1e9) - (index.get(b.id) ?? 1e9));
  }, [mysqlConnections, postgresConnections, mongoConnections, salesforceConnections, order]);

  aggregatedConnections.push(...orderedRealConnections);

  // Filter by search query
  const filteredConnections = aggregatedConnections.filter(conn =>
    conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conn.source_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const moveOrder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setOrder((prev) => {
      const fromIndex = prev.indexOf(fromId);
      const toIndex = prev.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromId);
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const openEditModal = async (conn: Connection) => {
    setEditing(conn);
    setEditName(conn.name);
    setEditDescription((conn as any).description || '');
    setShowPassword(false);
    setEditTest({ status: 'idle', message: '' });
    setEditItems([]);
    setEditSelected(new Set());

    const cfg = await connectionService.getConnectionConfig(conn.id);
    const creds = (cfg?.credentials || {}) as Record<string, any>;
    setEditCreds(creds);

    const intervalSeconds = typeof creds.auto_sync_interval_seconds === 'number'
      ? creds.auto_sync_interval_seconds
      : Number(creds.auto_sync_interval_seconds || 3600);
    const best = secondsToBestUnit(intervalSeconds);
    setAutoSyncValue(best.value);
    setAutoSyncUnit(best.unit);

    const selected =
      conn.source_type === 'mongodb'
        ? creds?.selected_collections
        : creds?.selected_tables;
    if (Array.isArray(selected)) {
      setEditSelected(new Set(selected));
    }
  };

  const runEditTest = async () => {
    if (!editing) return;
    setEditTest({ status: 'testing', message: 'Testing connection…' });
    setEditItems([]);

    try {
      const result = await connectionService.testConnection(editing.source_type, editCreds);
      if (!result?.success) {
        setEditTest({ status: 'error', message: result?.message || 'Connection failed.' });
        return;
      }

      const items =
        editing.source_type === 'mongodb'
          ? (result?.metadata?.collections || [])
          : (result?.metadata?.tables || []);

      const list: string[] = Array.isArray(items) ? items : [];
      setEditTest({ status: 'success', message: result?.message || 'Connection successful.' });
      setEditItems(list);

      // If there is no explicit selection saved, default to all
      const alreadySelected = editSelected.size > 0;
      if (!alreadySelected) setEditSelected(new Set(list));
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Connection failed.';
      setEditTest({ status: 'error', message: msg });
    }
  };

  const toggleEditItem = (name: string) => {
    setEditSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const setEditSelectAll = (checked: boolean) => {
    if (!checked) {
      setEditSelected(new Set());
      return;
    }
    setEditSelected(new Set(editItems));
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ width: '40px', height: '40px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f8fafc',
      padding: '32px 48px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 700, 
            color: '#1e293b',
            margin: '0 0 8px 0'
          }}>
            Databases
          </h1>
          <p style={{ 
            fontSize: '14px', 
            color: '#64748b',
            margin: 0
          }}>
            {aggregatedConnections.length} connected source{aggregatedConnections.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={async () => {
              if (isSyncingAll) return;
              setIsSyncingAll(true);
              try {
                for (const c of connections) {
                  await connectionService.syncConnection(c.id);
                }
                await queryClient.invalidateQueries({ queryKey: ['connections'] });
                await queryClient.invalidateQueries({ queryKey: ['databases'] });
                await queryClient.invalidateQueries({ queryKey: ['connectionStats'] });
              } finally {
                setIsSyncingAll(false);
              }
            }}
            style={{
              backgroundColor: 'white',
              color: '#4f46e5',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: isSyncingAll ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            disabled={isSyncingAll}
          >
                {isSyncingAll ? 'Syncing…' : 'Sync Now'}
          </button>

          <button
            onClick={() => navigate('/databases/create')}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4338ca')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4f46e5')}
          >
            <span style={{ fontSize: '16px' }}>+</span>
            Create Database
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ 
          position: 'relative',
          maxWidth: '600px'
        }}>
          <span style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '16px',
            color: '#94a3b8'
          }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Search databases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px 12px 44px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: 'white',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#4f46e5'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
        </div>
      </div>

      {/* Database cards grid */}
      {filteredConnections.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '64px 32px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗄️</div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
            No databases found
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
            {searchQuery ? 'Try adjusting your search query' : 'Get started by creating your first database connection'}
          </p>
          {!searchQuery && (
            <button
            onClick={() => navigate('/databases/create')}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Create Database
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: '24px'
        }}>
          {filteredConnections.map((connection) => (
            <DatabaseCard 
              key={connection.id} 
              connection={connection}
              menuOpen={menuOpenId === connection.id}
              onToggleMenu={() => setMenuOpenId((prev) => (prev === connection.id ? null : connection.id))}
              onCloseMenu={() => setMenuOpenId(null)}
              onSync={
                connection.id === 'file-uploads-aggregate'
                  ? undefined
                  : async () => {
                      await connectionService.syncConnection(connection.id);
                      await queryClient.invalidateQueries({ queryKey: ['connections'] });
                      await queryClient.invalidateQueries({ queryKey: ['databases', connection.id] });
                      await queryClient.invalidateQueries({ queryKey: ['connectionStats', connection.id] });
                    }
              }
              onEdit={
                connection.id === 'file-uploads-aggregate'
                  ? undefined
                  : () => {
                      void openEditModal(connection as any);
                    }
              }
              onDelete={
                connection.id === 'file-uploads-aggregate'
                  ? undefined
                  : async () => {
                      const ok = window.confirm(`Delete connection "${connection.name}"?`);
                      if (!ok) return;
                      await connectionService.deleteConnection(connection.id);
                      await queryClient.invalidateQueries({ queryKey: ['connections'] });
                    }
              }
              draggable={connection.id !== 'file-uploads-aggregate'}
              onDragStart={(e) => {
                if (connection.id === 'file-uploads-aggregate') return;
                dragIdRef.current = connection.id;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (connection.id === 'file-uploads-aggregate') return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (connection.id === 'file-uploads-aggregate') return;
                e.preventDefault();
                const fromId = dragIdRef.current;
                dragIdRef.current = null;
                if (!fromId) return;
                moveOrder(fromId, connection.id);
              }}
              onClick={() => {
                if (connection.id === 'file-uploads-aggregate') {
                  navigate('/databases/file-uploads');
                } else {
                  navigate(`/databases/${connection.id}`);
                }
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEditing(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 60
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 60px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Edit Connection</div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Update connection config, test, and select tables</div>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Name</div>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    fontSize: '14px'
                  }}
                />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Description</div>
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    fontSize: '14px'
                  }}
                />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Auto Sync</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="number"
                      min={1}
                      value={autoSyncValue}
                      onChange={(e) => setAutoSyncValue(Math.max(1, Number(e.target.value || 1)))}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        fontSize: '14px'
                      }}
                    />
                    <select
                      value={autoSyncUnit}
                      onChange={(e) => setAutoSyncUnit(e.target.value as any)}
                      style={{
                        width: '160px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        fontSize: '14px'
                      }}
                    >
                      <option value="min">Minutes</option>
                      <option value="hr">Hours</option>
                      <option value="day">Days</option>
                      <option value="week">Weeks</option>
                    </select>
                  </div>
                </div>

                {/* Credentials */}
                {editing.source_type !== 'mongodb' ? (
                  <>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Host</div>
                      <input
                        value={editCreds.host || ''}
                        onChange={(e) => setEditCreds((p) => ({ ...p, host: e.target.value }))}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Port</div>
                      <input
                        type="number"
                        value={editCreds.port ?? ''}
                        onChange={(e) => setEditCreds((p) => ({ ...p, port: Number(e.target.value || 0) }))}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Database Name</div>
                      <input
                        value={editCreds.database || ''}
                        onChange={(e) => setEditCreds((p) => ({ ...p, database: e.target.value }))}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                      />
                    </div>
                    {editing.source_type === 'postgresql' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Schema</div>
                        <input
                          value={editCreds.schema || 'public'}
                          onChange={(e) => setEditCreds((p) => ({ ...p, schema: e.target.value }))}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                        />
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Username</div>
                      <input
                        value={editCreds.username || ''}
                        onChange={(e) => setEditCreds((p) => ({ ...p, username: e.target.value }))}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Password</div>
                      <div style={{ position: 'relative' }}>
                        <input
                          value={editCreds.password || ''}
                          onChange={(e) => setEditCreds((p) => ({ ...p, password: e.target.value }))}
                          type={showPassword ? 'text' : 'password'}
                          style={{ width: '100%', padding: '12px 42px 12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Connection String</div>
                      <input
                        value={editCreds.connection_string || ''}
                        onChange={(e) => setEditCreds((p) => ({ ...p, connection_string: e.target.value }))}
                        placeholder="mongodb://localhost:27017"
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Database Name</div>
                      <input
                        value={editCreds.database || ''}
                        onChange={(e) => setEditCreds((p) => ({ ...p, database: e.target.value }))}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px' }}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={runEditTest}
                disabled={editTest.status === 'testing'}
                style={{
                  marginTop: '16px',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: editTest.status === 'testing' ? 'not-allowed' : 'pointer',
                  color: '#0f172a'
                }}
              >
                Test Connection
              </button>

              {editTest.status !== 'idle' && (
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: editTest.status === 'success' ? '#16a34a' : editTest.status === 'error' ? '#dc2626' : '#64748b'
                  }}
                >
                  {editTest.message}
                </div>
              )}

              {editTest.status === 'success' && (
                <div style={{ marginTop: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      {editing.source_type === 'mongodb' ? 'Collections' : 'Tables'}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0f172a' }}>
                      <input
                        type="checkbox"
                        checked={editItems.length > 0 && editSelected.size === editItems.length}
                        onChange={(e) => setEditSelectAll(e.target.checked)}
                      />
                      Select all
                    </label>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', maxHeight: '260px', overflow: 'auto', backgroundColor: 'white' }}>
                    {editItems.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b' }}>
                        No {editing.source_type === 'mongodb' ? 'collections' : 'tables'} found.
                      </div>
                    ) : (
                      editItems.map((name) => (
                        <label
                          key={name}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', color: '#0f172a' }}
                        >
                          <input type="checkbox" checked={editSelected.has(name)} onChange={() => toggleEditItem(name)} />
                          {name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setEditing(null)}
                style={{
                  backgroundColor: 'white',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const nextCreds = { ...editCreds };
                  nextCreds.auto_sync_enabled = true;
                  nextCreds.auto_sync_interval_seconds = Math.max(1, Number(autoSyncValue || 1)) * unitToSeconds(autoSyncUnit);
                  if (editing.source_type === 'mongodb') {
                    nextCreds.selected_collections = Array.from(editSelected);
                  } else {
                    nextCreds.selected_tables = Array.from(editSelected);
                  }

                  await connectionService.updateConnection(editing.id, {
                    name: editName,
                    description: editDescription,
                    credentials: nextCreds,
                    source_type: editing.source_type,
                  } as any);
                  await queryClient.invalidateQueries({ queryKey: ['connections'] });
                  await queryClient.invalidateQueries({ queryKey: ['databases', editing.id] });
                  await queryClient.invalidateQueries({ queryKey: ['connectionStats', editing.id] });
                  setEditing(null);
                }}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
