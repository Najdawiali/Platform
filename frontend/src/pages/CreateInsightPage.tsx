import React from 'react';
import { useNavigate } from 'react-router-dom';

type MainOption = {
  key: 'workflow' | 'sql' | 'agent';
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  isRecommended?: boolean;
  onClick: () => void;
};

export const CreateInsightPage: React.FC = () => {
  const navigate = useNavigate();

  const contentMaxWidth = 820;
  const mainCardHeight = 78;

  const options: MainOption[] = [
    {
      key: 'workflow',
      title: 'Workflow Builder',
      subtitle: 'Build an insight by selecting data and configuring charts.',
      icon: '🧩',
      iconBg: '#ecfdf5',
      onClick: () => navigate('/visualize'),
    },
    {
      key: 'sql',
      title: 'SQL Editor',
      subtitle: 'Write a SQL query and turn the result into an insight.',
      icon: '⌨️',
      iconBg: '#f1f5f9',
      onClick: () => navigate('/insights/sql-editor'),
    },
    {
      key: 'agent',
      title: 'AI Agent',
      subtitle: 'Ask questions in plain English and generate insights.',
      icon: '✨',
      iconBg: '#ecfdf5',
      isRecommended: true,
      onClick: () => navigate('/model'),
    },
  ];

  const renderMainOption = (opt: MainOption) => {
    const borderColor = opt.isRecommended ? '#22c55e' : '#e2e8f0';

    return (
      <div
        key={opt.key}
        role="button"
        tabIndex={0}
        onClick={opt.onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') opt.onClick();
        }}
        style={{
          width: '100%',
          backgroundColor: 'white',
          border: `1px solid ${borderColor}`,
          borderRadius: '14px',
          height: `${mainCardHeight}px`,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              backgroundColor: opt.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '16px' }}>{opt.icon}</span>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>{opt.title}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{opt.subtitle}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {opt.isRecommended && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#16a34a',
                backgroundColor: '#ecfdf5',
                border: '1px solid #bbf7d0',
                padding: '5px 10px',
                borderRadius: '999px',
              }}
            >
              Recommended
            </span>
          )}
          <span style={{ color: '#94a3b8', fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>→</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f8fafc' }}>
      <div
        style={{
          padding: '26px 34px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: `${contentMaxWidth}px` }}>
          <button
            onClick={() => navigate('/insights')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4f46e5',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              padding: 0,
              marginBottom: '14px',
            }}
          >
            ← Back to Insights
          </button>

          <div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Create Insight</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Choose the best way to build your insight
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {options.map(renderMainOption)}
          </div>

          <div
            style={{
              marginTop: '16px',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '16px 16px',
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>Not sure which to choose?</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Pick a starting point below</div>

            <div
              style={{
                marginTop: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/visualize')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate('/visualize');
                }}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '12px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  minHeight: '72px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>Workflow Builder</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Best for drag-and-drop charts</div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/insights/sql-editor')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate('/insights/sql-editor');
                }}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '12px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  minHeight: '72px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>SQL Editor</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Best if you know SQL</div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/model')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate('/model');
                }}
                style={{
                  border: '1px solid #22c55e',
                  borderRadius: '12px',
                  padding: '12px 12px',
                  cursor: 'pointer',
                  backgroundColor: '#f0fdf4',
                  minHeight: '72px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>AI Agent</div>
                  <div style={{ fontSize: '11px', fontWeight: 900, color: '#16a34a' }}>Recommended</div>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Fastest way to get insights</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
