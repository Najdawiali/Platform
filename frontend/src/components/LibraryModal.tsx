import React, { useState, useMemo } from 'react';
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
  Activity,
  Flame,
  Filter,
  Radar as RadarIcon,
  TreePine,
  BarChart4,
  BoxSelect,
  Search,
  ArrowUpDown
} from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (insight: any) => void;
}

type SortOption = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: dashboardService.getInsights,
    enabled: isOpen, // Only fetch when open
  });

  // Filter and sort insights
  const filteredAndSortedInsights = useMemo(() => {
    let result = [...insights];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(insight => 
        insight.name.toLowerCase().includes(query) ||
        (insight.description && insight.description.toLowerCase().includes(query))
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [insights, searchQuery, sortBy]);

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
      case 'heatmap': return <Flame size={48} className="text-indigo-500" />;
      case 'funnel': return <Filter size={48} className="text-indigo-500" />;
      case 'radar': return <RadarIcon size={48} className="text-indigo-500" />;
      case 'treemap': return <TreePine size={48} className="text-indigo-500" />;
      case 'histogram': return <BarChart4 size={48} className="text-indigo-500" />;
      case 'boxplot': return <BoxSelect size={48} className="text-indigo-500" />;
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
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 900,
              color: '#0f172a',
              fontStyle: 'italic',
              letterSpacing: '-0.5px',
              margin: 0
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

          {/* Search and Sort Controls */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
          }}>
            {/* Search Input */}
            <div style={{
              flex: 1,
              position: 'relative'
            }}>
              <Search 
                size={18} 
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8'
                }}
              />
              <input
                type="text"
                placeholder="Search insights by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 0.2s'
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

            {/* Sort Dropdown */}
            <div style={{ position: 'relative' }}>
              <ArrowUpDown 
                size={16} 
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  pointerEvents: 'none'
                }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                style={{
                  padding: '10px 12px 10px 36px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#0f172a',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  outline: 'none',
                  minWidth: '160px',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '36px',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4f46e5';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </select>
            </div>
          </div>
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
          ) : filteredAndSortedInsights.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>
                {searchQuery.trim() ? `No insights found matching "${searchQuery}"` : 'No insights found. Create one first!'}
              </div>
            </div>
          ) : (
            <>
              {/* Results Count */}
              <div style={{
                marginBottom: '20px',
                fontSize: '13px',
                color: '#64748b',
                fontWeight: 500
              }}>
                {filteredAndSortedInsights.length} {filteredAndSortedInsights.length === 1 ? 'insight' : 'insights'} found
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '24px'
              }}>
                {filteredAndSortedInsights.map((insight) => (
                  <div 
                    key={insight.id}
                    onClick={() => {
                      if (onSelect) {
                        onSelect(insight);
                        onClose();
                      }
                    }}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
