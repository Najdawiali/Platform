import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    
    console.log('[DEBUG] AuthCallback - Full URL:', window.location.href);
    console.log('[DEBUG] AuthCallback - Token:', token);
    
    if (token) {
      // Store the token with the correct key that authService expects
      localStorage.setItem('access_token', token);
      console.log('[DEBUG] Token stored as access_token, navigating to home');
      
      // Redirect to home page (which is the dashboard)
      navigate('/', { replace: true });
    } else {
      // If no token, redirect to login with error
      console.log('[DEBUG] No token found, redirecting to login');
      navigate('/login?error=oauth_failed', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#fafafa'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          margin: '0 auto 16px',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ fontSize: '16px', color: '#64748b' }}>Completing sign in...</p>
      </div>
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
