import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { logout } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';

export default function Navbar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { clearAuth, user, roles } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      clearAuth();
      toastSuccess('You have been logged out.');
      router.push('/login');
    } catch {
      toastError('Logout failed. Please try again.');
    }
  };

  const roleDisplay = roles && roles.length > 0
    ? roles.filter(r => r.roleName.toLowerCase() !== 'admin').map(r => r.roleName).join(', ') || 'User'
    : 'Viewer';

  return (
    <>
      <button
        className="menu-toggle-btn"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open Menu"
        title="Open Navigation"
      >
        ☰
      </button>

      <nav className="navbar">
        <div className="navbar-pill" role="navigation" aria-label="Main Navigation">
          <Link href="/dashboard" className="navbar-brand navbar-brand-start">
            ⚡ FormCraft
          </Link>

          {user && (
            <span className="navbar-user-chip">
              👤 {user.username} <span style={{ opacity: 0.5 }}>|</span> {roleDisplay}
            </span>
          )}

          <div className="navbar-actions">
            <button
              className="theme-toggle-btn"
              onClick={(e) => toggleTheme(e)}
              title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
              aria-label="Toggle theme"
            >
              <span className={`theme-toggle-icon ${theme === 'dark' ? 'icon-sun' : 'icon-moon'}`}>
                {theme === 'dark' ? '☀️' : '🌙'}
              </span>
            </button>

            <button className="btn btn-secondary btn-sm" onClick={handleLogout} title="Logout">⎋</button>
          </div>
        </div>
      </nav>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      <style jsx>{`
        .menu-toggle-btn {
          position: fixed;
          top: 18px;
          left: 20px;
          z-index: 4900;
          background: ${theme === 'dark' ? 'rgba(15, 15, 35, 0.75)' : 'rgba(255, 255, 255, 0.85)'};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1.5px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'};
          color: ${theme === 'dark' ? '#fff' : '#0f172a'};
          font-size: 1.4rem;
          width: 52px;
          height: 52px;
          border-radius: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: ${theme === 'dark' ? '0 10px 30px rgba(0, 0, 0, 0.4)' : '0 10px 30px rgba(0, 0, 0, 0.05)'}, 
                      inset 0 1px 0 ${theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)'};
        }
        .menu-toggle-btn:hover {
          background: ${theme === 'dark' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.15)'};
          border-color: var(--accent);
          color: var(--accent);
          transform: scale(1.08) translateY(-2px);
          box-shadow: 0 14px 40px rgba(139, 92, 246, 0.25);
        }
        .menu-toggle-btn:active {
          transform: scale(0.95);
        }
        .navbar {
          width: 100%;
          display: flex;
          justify-content: center;
          pointer-events: none; /* Let clicks pass through to toggle if needed, but pill will override */
        }
        .navbar-pill {
          pointer-events: auto; /* Ensure pill is interactive */
          margin: 0 auto; /* Extra centering insurance */
        }
        @media (max-width: 768px) {
          .navbar-user-chip { display: none; }
          .menu-toggle-btn {
            top: 12px;
            left: 12px;
            width: 44px;
            height: 44px;
            font-size: 1.2rem;
          }
        }
      `}</style>
    </>
  );
}
