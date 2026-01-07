import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { connectionService } from '../services/connectionService';
import { datasetService } from '../services/datasetService';
import { dashboardService } from '../services/dashboardService';
import type { Connection, Dataset, DashboardListItem } from '../types';

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
  if (diffHr < 24) return `${diffHr} hours ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay} days ago`;
}

function countThisWeek(dates: Array<string | undefined>): number {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return dates.filter((d) => {
    if (!d) return false;
    const t = Date.parse(d);
    if (!Number.isFinite(t)) return false;
    return now - t <= weekMs;
  }).length;
}

const QuickActionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}> = ({ icon, title, subtitle, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        backgroundColor: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '18px 18px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#eef2ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ fontSize: '18px', color: '#94a3b8', paddingLeft: '10px' }}>→</div>
    </button>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  value: number;
  label: string;
  deltaText?: string;
}> = ({ icon, value, label, deltaText }) => {
  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '16px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            backgroundColor: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{label}</div>
        </div>
      </div>
      {deltaText ? (
        <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700 }}>{deltaText}</div>
      ) : (
        <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700 }}>✓ Active</div>
      )}
    </div>
  );
};

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
    retry: false,
  });

  const { data: datasets = [] } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
    retry: false,
  });

  const { data: dashboards = [] } = useQuery<DashboardListItem[]>({
    queryKey: ['dashboards'],
    queryFn: () => dashboardService.getDashboards(),
    retry: false,
  });

  const databasesCount = connections.length;
  const insightsCount = datasets.length;
  const dashboardsCount = dashboards.length;

  const dbDelta = countThisWeek(connections.map((c) => c.created_at));
  const insightsDelta = countThisWeek(datasets.map((d) => d.created_at));

  const recentInsights = useMemo(() => {
    const items = [...dashboards];
    items.sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.created_at);
      const tb = Date.parse(b.updated_at || b.created_at);
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
    return items.slice(0, 3);
  }, [dashboards]);

  return (
    <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f8fafc' }}>
      <div style={{ padding: '26px 34px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Welcome back</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Here's what's happening with your data</div>
        </div>

        <div style={{ marginTop: '26px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em' }}>QUICK ACTIONS</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '16px',
              marginTop: '12px',
            }}
          >
            <QuickActionCard
              icon={<span style={{ fontSize: '18px' }}>🗄️</span>}
              title="Connect Data"
              subtitle="Add a new database or upload files"
              onClick={() => navigate('/databases/create')}
            />
            <QuickActionCard
              icon={<span style={{ fontSize: '18px' }}>💡</span>}
              title="Create Insight"
              subtitle="Build visualizations from your data"
              onClick={() => navigate('/insights/create')}
            />
            <QuickActionCard
              icon={<span style={{ fontSize: '18px' }}>✨</span>}
              title="Ask AI"
              subtitle="Query data with natural language"
              onClick={() => navigate('/ai-chat')}
            />
          </div>
        </div>

        <div style={{ marginTop: '26px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em' }}>OVERVIEW</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '16px',
              marginTop: '12px',
            }}
          >
            <StatCard
              icon={<span style={{ fontSize: '16px' }}>🗄️</span>}
              value={databasesCount}
              label="Databases"
              deltaText={`+${dbDelta} this week`}
            />
            <StatCard
              icon={<span style={{ fontSize: '16px' }}>❔</span>}
              value={insightsCount}
              label="Insights"
              deltaText={`+${insightsDelta} this week`}
            />
            <StatCard icon={<span style={{ fontSize: '16px' }}>▦</span>} value={dashboardsCount} label="Dashboards" />
          </div>
        </div>

        <div style={{ marginTop: '26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em' }}>RECENT INSIGHTS</div>
            <button
              onClick={() => navigate('/insights')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4f46e5',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              View all →
            </button>
          </div>

          <div
            style={{
              marginTop: '12px',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              overflow: 'hidden',
            }}
          >
            {recentInsights.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '13px', color: '#64748b' }}>No insights yet.</div>
            ) : (
              recentInsights.map((d) => (
                <div
                  key={d.id}
                  onClick={() => navigate(`/dashboards/${d.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '14px 16px',
                    borderTop: '1px solid #f1f5f9',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '12px',
                        backgroundColor: '#eef2ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>💡</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {d.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.description || '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px', flexShrink: 0 }}>
                    <span>🕒</span>
                    {formatRelativeTime(d.updated_at || d.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>


      </div>
    </div>
  );
};
