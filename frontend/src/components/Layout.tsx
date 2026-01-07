import React from 'react';
import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/databases', label: 'Databases', icon: '🗄️' },
    { path: '/insights', label: 'Insights', icon: '💡' },
    { path: '/dashboards', label: 'Dashboards', icon: '▦' },
    // AI Agent removed for now - coming soon
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Left Sidebar Navigation */}
      <aside
        style={{
          width: '248px',
          backgroundColor: 'white',
          color: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #e2e8f0',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 18px' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                backgroundColor: '#4f46e5',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 900,
              }}
            >
              𝗗
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>DataPulse</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Analytics</div>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav style={{ flex: 1, padding: '6px 10px' }}>
          {navItems.map((item) => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  margin: '6px 6px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: isActive ? '#eef2ff' : 'transparent',
                  color: isActive ? '#4f46e5' : '#64748b',
                }}
              >
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#64748b',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ⚙️ Settings
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#64748b',
              cursor: 'pointer',
              textAlign: 'left',
              marginTop: '4px',
            }}
          >
            ⇦ Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Outlet />
      </div>
    </div>
  );
};