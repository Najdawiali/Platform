import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';
import { 
  X, 
  BarChart3, 
  PieChart, 
  LineChart, 
  Table as TableIcon, 
  AreaChart, 
  ScatterChart, 
  Gauge, 
  TrendingUp,
  Activity
} from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose }) => {
  const { data: allDashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: dashboardService.getDashboards,
    enabled: isOpen, // Only fetch when open
  });

  // Filter for insights (single chart dashboards)
  const insights = allDashboards.filter(d => d.chart_count === 1);

  if (!isOpen) return null;

  const getIconForType = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'bar': return <BarChart3 size={48} className="text-indigo-500" />;
      case 'pie': return <PieChart size={48} className="text-indigo-500" />;
      case 'line': return <LineChart size={48} className="text-indigo-500" />;
      case 'table': return <TableIcon size={48} className="text-indigo-500" />;
      case 'area': return <AreaChart size={48} className="text-indigo-500" />;
      case 'scatter': return <ScatterChart size={48} className="text-indigo-500" />;
      case 'gauge': return <Gauge size={48} className="text-indigo-500" />;
      case 'kpi': return <TrendingUp size={48} className="text-indigo-500" />;
      default: return <Activity size={48} className="text-indigo-500" />;
    }
  };

  return (
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
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        width: '900px',
        maxWidth: '90vw',
        height: '600px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 32px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 900,
            color: '#0f172a',
            fontStyle: 'italic',
            letterSpacing: '-0.5px'
          }}>
            LIBRARY
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px',
          backgroundColor: '#f8fafc'
        }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading insights...</div>
          ) : insights.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No insights found. Create one first!</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '24px'
            }}>
              {insights.map((insight) => (
                <div 
                  key={insight.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.borderColor = '#4f46e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  {/* Image Placeholder */}
                  <div style={{
                    height: '140px',
                    backgroundColor: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottom: '1px solid #f1f5f9'
                  }}>
                    {getIconForType(insight.first_chart_type)}
                  </div>
                  
                  {/* Title */}
                  <div style={{ padding: '16px' }}>
                    <h3 style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0f172a',
                      margin: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {insight.name}
                    </h3>
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
