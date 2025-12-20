import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/authService';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.login({ email, password });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      {/* Left Sidebar - Blue Section */}
      <div style={{
        width: '440px',
        background: 'linear-gradient(180deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
        padding: '48px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: 'white'
      }}>
        {/* Logo Section */}
        <div>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: 'white',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '48px',
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#1e3a8a'
          }}>
            DP
          </div>

          {/* Brand Name */}
          <div style={{
            fontSize: '32px',
            fontWeight: 'bold',
            marginBottom: '48px',
            letterSpacing: '-0.5px'
          }}>
            DataPlatform
          </div>

          {/* Quote Section */}
          <div style={{
            fontSize: '18px',
            lineHeight: '1.7',
            fontWeight: '400',
            opacity: 0.95,
            fontStyle: 'italic'
          }}>
            "In the age of information, data quality is not just a technical requirement—it's the foundation of intelligent decision-making. Clean, reliable data transforms chaos into clarity, enabling organizations to move from guesswork to precision."
          </div>
        </div>

        {/* Author Section */}
        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '4px'
          }}>
            Haitham Alnjdawi
          </div>
          <div style={{
            fontSize: '14px',
            opacity: 0.8
          }}>
            Data Platform
          </div>
        </div>
      </div>

      {/* Right Section - Login Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        padding: '48px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '440px'
        }}>
          {/* Header */}
          <div style={{ marginBottom: '48px' }}>
            <h1 style={{
              fontSize: '32px',
              fontWeight: '600',
              color: '#0f172a',
              marginBottom: '8px',
              letterSpacing: '-0.5px'
            }}>
              Sign in to DataPlatform
            </h1>
            <p style={{
              fontSize: '15px',
              color: '#64748b',
              margin: 0
            }}>
              Transform your data into actionable insights.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              marginBottom: '24px',
              padding: '14px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Email Field */}
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="email" style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#0f172a'
              }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '15px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="password" style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#0f172a'
              }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '15px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 24px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'background-color 0.15s ease',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Sign Up Link */}
          <div style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#64748b'
          }}>
            Don't have an account yet?{' '}
            <Link to="/register" style={{
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: '600'
            }}>
              Sign up
            </Link>
          </div>

          {/* Footer */}
          <div style={{
            marginTop: '64px',
            paddingTop: '24px',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '13px',
              color: '#94a3b8',
              marginBottom: '12px'
            }}>
              © DataPlatform 2025
            </div>
            <div style={{
              fontSize: '13px',
              color: '#64748b'
            }}>
              Empowering data-driven decisions through quality and reliability.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};