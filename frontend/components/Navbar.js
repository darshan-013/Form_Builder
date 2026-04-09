import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { logout } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';import { useTheme } from '../context/ThemeContext';
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
    ? roles.map(r => r.roleName).join(', ')
    : 'Viewer';

  return (
    <>
      <nav className="navbar">
        <div className="navbar-pill" role="navigation" aria-label="Main Navigation">
          <button 
            className="menu-toggle-btn" 
            onClick={() => setSidebarOpen(true)}
            aria-label="Open Menu"
          >
            ☰
          </button>

          <Link href="/dashboard" className="navbar-brand navbar-brand-start">
            ⚡ FormCraft
          </Link>

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
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
          font-size: 1.2rem;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          margin-right: 8px;
        }
        .menu-toggle-btn:hover {
          background: rgba(139, 92, 246, 0.15);
          border-color: rgba(139, 92, 246, 0.4);
          color: #A5B4FC;
          transform: scale(1.05);
        }
        .navbar-user-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px 4px 4px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
        }
        .navbar-user-chip:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }
        .navbar-avatar, .navbar-avatar-placeholder {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-cover: cover;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.1);
          font-size: 0.9rem;
        }
        .navbar-username { font-weight: 500; }
        .navbar-role-divider { opacity: 0.3; }
        .navbar-role { opacity: 0.6; font-size: 0.85rem; }
        @media (max-width: 768px) {
          .navbar-user-chip { display: none; }
        } 
        @media (min-width: 1024px) {
          .menu-toggle-btn { display: none; }
        }
      `}</style>
    </>
  );
}
