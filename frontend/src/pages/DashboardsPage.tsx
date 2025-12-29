import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../services/dashboardService';

import { format } from 'date-fns';

const DashboardsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch dashboards (exclude single-chart insights)
  const { data: allDashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: dashboardService.getDashboards,
  });

  // Filter to show only multi-chart dashboards (insights have chart_count === 1)
  const dashboards = allDashboards.filter(d => d.chart_count !== 1);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => dashboardService.deleteDashboard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setDeleteConfirm(null);
    },
  });

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      deleteMutation.mutate(id);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading dashboards...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
      {/* Top Bar */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '24px 32px',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#0f172a',
              marginBottom: '8px',
              letterSpacing: '-0.5px'
            }}>
              My Dashboards
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', fontWeight: 400 }}>
              View, manage, and create custom analytics dashboards
            </p>
          </div>
          <button
            onClick={() => navigate('/visualize')}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#4338ca';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(79, 70, 229, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#4f46e5';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.2)';
            }}
          >
            <span style={{ fontSize: '18px' }}>+</span>
            <span>Create Dashboard</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Dashboard Grid */}
          {dashboards.length === 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '2px dashed #e2e8f0',
              padding: '80px 32px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '80px', marginBottom: '24px', opacity: 0.5 }}>📊</div>
              <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginBottom: '12px', letterSpacing: '-0.5px' }}>
                No dashboards yet
              </h3>
              <p style={{ color: '#64748b', marginBottom: '32px', fontSize: '15px', maxWidth: '400px', margin: '0 auto 32px' }}>
                Start creating beautiful dashboards by selecting datasets and building visualizations
              </p>
              <button
                onClick={() => navigate('/visualize')}
                style={{
                  padding: '14px 32px',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Get Started
          </button>
        </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '24px'
            }}>
              {dashboards.map((dashboard) => (
                <div
                  key={dashboard.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = '#4f46e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  {/* Card Header with gradient */}
                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '24px',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                  onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '48px', opacity: 0.9 }}>📊</div>
                      <div style={{
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        backdropFilter: 'blur(10px)',
                        color: 'white',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: '1px solid rgba(255,255,255,0.3)'
                      }}>
                        {dashboard.chart_count} {dashboard.chart_count === 1 ? 'chart' : 'charts'}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '24px' }}>
                    <h3
                      onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        letterSpacing: '-0.3px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {dashboard.name}
                    </h3>
                    
                    {dashboard.description && (
                      <p style={{
                        color: '#64748b',
                        fontSize: '14px',
                        marginBottom: '16px',
                        lineHeight: '1.6',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {dashboard.description}
                      </p>
                    )}
                    
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginTop: dashboard.description ? '16px' : '0',
                      paddingTop: '16px',
                      borderTop: '1px solid #f1f5f9'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span>📅</span>
                        <span>{format(new Date(dashboard.created_at), 'MMM d, yyyy')}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboards/${dashboard.id}`);
                        }}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          backgroundColor: '#4f46e5',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
                      >
                        Open
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(dashboard.id);
                        }}
                        style={{
                          padding: '10px 16px',
                          backgroundColor: deleteConfirm === dashboard.id ? '#10b981' : '#fee2e2',
                          color: deleteConfirm === dashboard.id ? 'white' : '#dc2626',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          minWidth: '90px'
                        }}
                        onMouseEnter={(e) => {
                          if (deleteConfirm === dashboard.id) {
                            e.currentTarget.style.backgroundColor = '#059669';
                          } else {
                            e.currentTarget.style.backgroundColor = '#fecaca';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (deleteConfirm === dashboard.id) {
                            e.currentTarget.style.backgroundColor = '#10b981';
                          } else {
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                          }
                        }}
                      >
                        {deleteConfirm === dashboard.id ? '✓ Confirm' : '🗑️ Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { DashboardsPage };
