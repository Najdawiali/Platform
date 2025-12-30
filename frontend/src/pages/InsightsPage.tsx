import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { dashboardService } from '../services/dashboardService';
import type { DashboardListItem } from '../types';

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

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [orderBy, setOrderBy] = useState<'date' | 'name'>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const { data: dashboards = [] } = useQuery<DashboardListItem[]>({
    queryKey: ['dashboards'],
    queryFn: () => dashboardService.getDashboards(),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (dashboardId: string) => dashboardService.deleteDashboard(dashboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId && menuRefs.current[openMenuId]) {
        const menuElement = menuRefs.current[openMenuId];
        if (menuElement && !menuElement.contains(event.target as Node)) {
          setOpenMenuId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const handleDelete = (e: React.MouseEvent, dashboardId: string, dashboardName: string) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${dashboardName}"? This action cannot be undone.`)) {
      deleteMutation.mutate(dashboardId);
      setOpenMenuId(null);
    }
  };

  const handleMenuToggle = (e: React.MouseEvent, dashboardId: string) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === dashboardId ? null : dashboardId);
  };

  const sortedDashboards = useMemo(() => {
    const dateValue = (d: DashboardListItem): number => {
      const iso = d.updated_at || d.created_at;
      const t = Date.parse(iso || '');
      return Number.isFinite(t) ? t : 0;
    };

    const nameValue = (d: DashboardListItem): string => (d.name || '').toLowerCase();

    let copy = [...dashboards];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      copy = copy.filter((d) => (d.name || '').toLowerCase().includes(q));
    }

    copy.sort((a, b) => {
      if (orderBy === 'name') {
        const cmp = nameValue(a).localeCompare(nameValue(b));
        if (cmp !== 0) return cmp;
        return dateValue(b) - dateValue(a);
      }

      // Default: most recently edited/created first
      const cmp = dateValue(b) - dateValue(a);
      if (cmp !== 0) return cmp;
      return nameValue(a).localeCompare(nameValue(b));
    });
    return copy;
  }, [dashboards, orderBy, searchQuery]);

  const count = sortedDashboards.length;

  return (
    <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f8fafc' }}>
      <div style={{ padding: '22px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Insights</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{count} insights</div>
          </div>

          <button
            onClick={() => navigate('/insights/create')}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
            Create Insight
          </button>
        </div>

        {/* Search / controls row */}
        <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, maxWidth: '360px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '10px 12px',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>🔎</span>
              <input
                placeholder="Search insights..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '13px',
                  color: '#0f172a',
                  background: 'transparent',
                }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '8px 10px',
            marginLeft: 'auto',
          }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>Order by</div>
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value === 'name' ? 'name' : 'date')}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '8px 10px',
                fontSize: '13px',
                color: '#0f172a',
                backgroundColor: 'white',
                outline: 'none',
                cursor: 'pointer',
              }}
              aria-label="Order insights"
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* Cards grid */}
        <div style={{
          marginTop: '18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '18px',
        }}>
          {sortedDashboards.map((d) => (
            <div
              key={d.id}
              style={{
                position: 'relative',
                textAlign: 'left',
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '16px 16px',
                minHeight: '160px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/insights/${d.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    backgroundColor: '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: '16px' }}>💡</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.description || '—'}
                    </div>
                  </div>
                </div>

                <div
                  ref={(el) => {
                    if (el) menuRefs.current[d.id] = el;
                  }}
                  style={{ position: 'relative' }}
                >
                  <button
                    type="button"
                    onClick={(e) => handleMenuToggle(e, d.id)}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      border: '1px solid transparent',
                      backgroundColor: openMenuId === d.id ? '#f1f5f9' : 'transparent',
                      color: '#94a3b8',
                      fontSize: '18px',
                      lineHeight: '34px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (openMenuId !== d.id) {
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (openMenuId !== d.id) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                    aria-label="More options"
                  >
                    …
                  </button>

                  {/* Dropdown Menu */}
                  {openMenuId === d.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                        minWidth: '160px',
                        zIndex: 1000,
                        overflow: 'hidden',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, d.id, d.name)}
                        disabled={deleteMutation.isPending}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          textAlign: 'left',
                          border: 'none',
                          backgroundColor: 'transparent',
                          color: '#dc2626',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: deleteMutation.isPending ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!deleteMutation.isPending) {
                            e.currentTarget.style.backgroundColor = '#fef2f2';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>🗑️</span>
                        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', color: '#94a3b8', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📈</span>
                  <span>{d.chart_count} chart{d.chart_count === 1 ? '' : 's'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🕒</span>
                  <span>{formatRelativeTime(d.updated_at || d.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
