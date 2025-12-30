import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Type, LayoutTemplate, Share2, Send } from 'lucide-react';
import { LibraryModal } from '../components/LibraryModal';

export const CreateDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' }}>
      <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
      
      {/* Header */}
      <header style={{
        height: '64px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/dashboards')}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={20} color="#64748b" />
          </button>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Executive Review 2025</h1>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', letterSpacing: '0.5px' }}>LIVE ARCHITECT</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: '#f1f5f9', 
            borderRadius: '8px', 
            padding: '4px',
            marginRight: '12px'
          }}>
            <button className="toolbar-btn" onClick={() => setIsLibraryOpen(true)}>
              <BarChart3 size={16} />
              <span>Insight</span>
            </button>
            <button className="toolbar-btn">
              <Type size={16} />
              <span>Text</span>
            </button>
            <button className="toolbar-btn">
              <LayoutTemplate size={16} />
              <span>Section</span>
            </button>
          </div>

          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#0f172a',
            cursor: 'pointer'
          }}>
            <Share2 size={16} />
            Share
          </button>

          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#4f46e5',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'white',
            cursor: 'pointer'
          }}>
            <Send size={16} />
            PUBLISH
          </button>
        </div>
      </header>

      {/* Canvas Area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', padding: '24px' }}>
        <div style={{
          width: '100%',
          height: '100%',
          backgroundColor: 'white',
          borderRadius: '24px',
          border: '2px dashed #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
            <div style={{ textAlign: 'center', color: '#0f172a' }}>
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                    <BarChart3 size={48} color="#4f46e5" strokeWidth={1.5} />
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.5px' }}>BLUEPRINT EMPTY</h2>
            </div>
        </div>
      </div>
      
      <style>{`
        .toolbar-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border: none;
          background-color: transparent;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toolbar-btn:hover {
          background-color: white;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
};
