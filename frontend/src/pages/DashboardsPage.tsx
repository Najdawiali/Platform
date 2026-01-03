import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../services/dashboardService';
import type { DashboardCreate } from '../types';

import { format } from 'date-fns';

const DashboardsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardDescription, setDashboardDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [setAsMain, setSetAsMain] = useState(false);
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editingDescriptionValue, setEditingDescriptionValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onMouseDown = (event: MouseEvent) => {
      const el = menuRef.current;
      if (!el) return;
      if (el.contains(event.target as Node)) return;
      setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openMenuId]);

  // Fetch dashboards (backend already filters out insights via is_insight flag)
  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: dashboardService.getDashboards,
  });

  // Create dashboard mutation
  const createMutation = useMutation({
    mutationFn: (data: DashboardCreate) => dashboardService.createDashboard(data),
    onSuccess: (newDashboard) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setShowCreateModal(false);
      setDashboardName('');
      setDashboardDescription('');
      setIsPrivate(true);
      setSetAsMain(false);
      // Navigate to edit mode for the new dashboard
      navigate(`/dashboards/new?edit=${newDashboard.id}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => dashboardService.deleteDashboard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setDeleteConfirm(null);
      setOpenMenuId(null);
    },
  });

  // Update description mutation
  const updateDescriptionMutation = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      dashboardService.updateDashboard(id, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setEditingDescriptionId(null);
      setEditingDescriptionValue('');
    },
  });

  const setMainMutation = useMutation({
    mutationFn: (id: string) => dashboardService.updateDashboard(id, { is_main: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setOpenMenuId(null);
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, isPrivate }: { id: string; isPrivate: boolean }) =>
      dashboardService.updateDashboard(id, { is_private: isPrivate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setOpenMenuId(null);
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

  const handleCreateDashboard = () => {
    if (!dashboardName.trim()) return;
    
    createMutation.mutate({
      name: dashboardName.trim(),
      description: dashboardDescription.trim() || undefined,
      is_main: setAsMain,
      is_private: isPrivate,
      charts: [],
    });
  };

  const handleDescriptionClick = (e: React.MouseEvent, dashboardId: string, currentDescription?: string) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingDescriptionId(dashboardId);
    setEditingDescriptionValue(currentDescription || '');
  };

  const handleDescriptionSave = (dashboardId: string) => {
    updateDescriptionMutation.mutate({
      id: dashboardId,
      description: editingDescriptionValue.trim(),
    });
  };

  const handleDescriptionCancel = () => {
    setEditingDescriptionId(null);
    setEditingDescriptionValue('');
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
            onClick={() => setShowCreateModal(true)}
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
            <span>New Dashboard</span>
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
              border: '1px solid #e2e8f0',
              padding: '64px 48px',
              textAlign: 'center',
              maxWidth: '600px',
              margin: '40px auto',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                backgroundColor: '#f1f5f9',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px'
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#0f172a',
                marginBottom: '12px',
                letterSpacing: '-0.3px'
              }}>
                No Dashboards Created
              </h3>
              <p style={{
                color: '#64748b',
                fontSize: '15px',
                lineHeight: '1.6',
                maxWidth: '440px',
                margin: '0 auto',
                fontWeight: 400
              }}>
                Create your first dashboard by clicking the "New Dashboard" button above to start visualizing your data with custom charts and analytics.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: '20px'
            }}>
              {dashboards.map((dashboard) => (
                <div
                  key={dashboard.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    padding: '20px',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Card Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: '#6366f1',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        flexShrink: 0,
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                        </svg>
                      </div>
                      {dashboard.is_main && (
                        <span style={{
                          backgroundColor: '#10b981',
                          color: 'white',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}>
                          Main
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
                      <div style={{
                        color: '#fbbf24',
                        fontSize: '20px',
                        lineHeight: 1,
                      }}>
                        ★
                      </div>
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId((prev) => (prev === dashboard.id ? null : dashboard.id));
                          }}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: '#eef2ff',
                            color: '#1f2937',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            lineHeight: 1,
                          }}
                          aria-label="Dashboard menu"
                        >
                          …
                        </button>

                        {openMenuId === dashboard.id && (
                          <div
                            ref={menuRef}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute',
                              top: '42px',
                              right: 0,
                              width: '180px',
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '12px',
                              boxShadow: '0 10px 20px rgba(0,0,0,0.12)',
                              overflow: 'hidden',
                              zIndex: 10,
                            }}
                          >
                            <button
                              type="button"
                              disabled={!!dashboard.is_main || setMainMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (dashboard.is_main) return;
                                setMainMutation.mutate(dashboard.id);
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: 'none',
                                backgroundColor: 'white',
                                cursor: dashboard.is_main ? 'default' : 'pointer',
                                textAlign: 'left',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#111827',
                                opacity: dashboard.is_main ? 0.6 : 1,
                              }}
                            >
                              {dashboard.is_main ? 'Main dashboard' : 'Set as main'}
                            </button>

                            <button
                              type="button"
                              disabled={toggleVisibilityMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentIsPrivate = dashboard.is_private ?? true;
                                toggleVisibilityMutation.mutate({ id: dashboard.id, isPrivate: !currentIsPrivate });
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: 'none',
                                backgroundColor: 'white',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#111827',
                              }}
                            >
                              {(dashboard.is_private ?? true) ? 'Make public' : 'Make private'}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(dashboard.id);
                                if (deleteConfirm === dashboard.id) {
                                  setOpenMenuId(null);
                                }
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: 'none',
                                backgroundColor: 'white',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#dc2626',
                              }}
                            >
                              {deleteConfirm === dashboard.id ? 'Confirm delete' : 'Delete dashboard'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div>
                    <h3 style={{
                      fontSize: '17px',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '6px',
                      letterSpacing: '-0.2px',
                    }}>
                      {dashboard.name}
                    </h3>
                    
                    {/* Editable Description */}
                    {editingDescriptionId === dashboard.id ? (
                      <div style={{ marginBottom: '16px' }}>
                        <textarea
                          value={editingDescriptionValue}
                          onChange={(e) => setEditingDescriptionValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          rows={2}
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            outline: 'none',
                            fontFamily: 'inherit',
                            resize: 'none',
                            boxSizing: 'border-box',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#6366f1';
                            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.1)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#d1d5db';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDescriptionSave(dashboard.id);
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#6366f1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDescriptionCancel();
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#f3f4f6',
                              color: '#6b7280',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => handleDescriptionClick(e, dashboard.id, dashboard.description)}
                        style={{
                          fontSize: '14px',
                          marginBottom: '16px',
                          lineHeight: '1.6',
                          minHeight: '42px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          cursor: 'text',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          backgroundColor: dashboard.description ? 'transparent' : '#f9fafb',
                          border: dashboard.description ? '1px solid transparent' : '1px dashed #e5e7eb',
                          color: dashboard.description ? '#4b5563' : '#9ca3af',
                          fontStyle: dashboard.description ? 'normal' : 'italic',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (dashboard.description) {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                            e.currentTarget.style.borderColor = '#e5e7eb';
                          } else {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                            e.currentTarget.style.borderColor = '#d1d5db';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dashboard.description) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'transparent';
                          } else {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                            e.currentTarget.style.borderColor = '#e5e7eb';
                          }
                        }}
                      >
                        {dashboard.description || 'Double-click to add description'}
                      </div>
                    )}
                    
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '13px',
                      color: '#6b7280',
                      paddingTop: '12px',
                      borderTop: '1px solid #f3f4f6'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{dashboard.chart_count} insights</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span>{(dashboard.is_private ?? true) ? 'Private' : 'Public'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>{format(new Date(dashboard.created_at), 'MMM d')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Dashboard Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '24px 24px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                }}>
                  📊
                </div>
                <div>
                  <h2 style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: 0,
                    letterSpacing: '-0.3px',
                  }}>
                    Create Dashboard
                  </h2>
                  <p style={{
                    fontSize: '13px',
                    color: '#64748b',
                    margin: '2px 0 0',
                  }}>
                    Create a new dashboard to organize your insights
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px' }}>
              {/* Dashboard Name */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0f172a',
                  marginBottom: '8px',
                }}>
                  Dashboard Name
                </label>
                <input
                  type="text"
                  value={dashboardName}
                  onChange={(e) => setDashboardName(e.target.value)}
                  placeholder="e.g., Sales Overview"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#4f46e5';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0f172a',
                  marginBottom: '8px',
                }}>
                  Description <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={dashboardDescription}
                  onChange={(e) => setDashboardDescription(e.target.value)}
                  placeholder="Describe what this dashboard shows..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.15s ease',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#4f46e5';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Visibility */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0f172a',
                  marginBottom: '8px',
                }}>
                  Visibility
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={isPrivate ? 'private' : 'public'}
                    onChange={(e) => setIsPrivate(e.target.value === 'private')}
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      appearance: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="private">🔒 Private - Only you can see</option>
                    <option value="public">🌐 Public - Everyone can see</option>
                  </select>
                  <div style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: '#94a3b8',
                  }}>
                    ▼
                  </div>
                </div>
              </div>

              {/* Set as Main Dashboard */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                marginBottom: '24px',
              }}>
                <div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0f172a',
                    marginBottom: '2px',
                  }}>
                    Set as Main Dashboard
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#64748b',
                  }}>
                    This will be your default landing dashboard
                  </div>
                </div>
                <label style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: '48px',
                  height: '28px',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={setAsMain}
                    onChange={(e) => setSetAsMain(e.target.checked)}
                    style={{ display: 'none' }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: setAsMain ? '#4f46e5' : '#cbd5e1',
                    borderRadius: '14px',
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '3px',
                      left: setAsMain ? '23px' : '3px',
                      width: '22px',
                      height: '22px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    }} />
                  </div>
                </label>
              </div>

              {/* Modal Footer */}
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#64748b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateDashboard}
                  disabled={!dashboardName.trim() || createMutation.isPending}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: !dashboardName.trim() || createMutation.isPending ? '#cbd5e1' : '#4f46e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: !dashboardName.trim() || createMutation.isPending ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (dashboardName.trim() && !createMutation.isPending) {
                      e.currentTarget.style.backgroundColor = '#4338ca';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (dashboardName.trim() && !createMutation.isPending) {
                      e.currentTarget.style.backgroundColor = '#4f46e5';
                    }
                  }}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Dashboard'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { DashboardsPage };
