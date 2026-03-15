import { useRouter } from 'next/router';
import Link from 'next/link';
import { logout } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { can, clearAuth, user, roles, hasRole } = useAuth();

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
          <Link href="/dashboard" className="btn btn-secondary btn-sm">⌂ Dashboard</Link>

          {can('MANAGE') && (
            <Link href="/roles" className="btn btn-secondary btn-sm">🛡 Roles</Link>
          )}

          {can('MANAGE') && (
            <Link href="/users" className="btn btn-secondary btn-sm">👤 Users</Link>
          )}

          {hasRole('Admin') && (
            <Link href="/logs/admin" className="btn btn-secondary btn-sm">🧾 Audit Logs</Link>
          )}

          {hasRole('Role Administrator') && (
            <Link href="/logs/role-assignments" className="btn btn-secondary btn-sm">🗂 Role Logs</Link>
          )}

          {(hasRole('Manager') || hasRole('Approver') || hasRole('Builder')) && (
            <Link href="/admin/approvals" className="btn btn-secondary btn-sm">✓ Approval Inbox</Link>
          )}

          {(hasRole('Creator') || hasRole('Viewer')) && (
            <Link href="/workflows/status" className="btn btn-secondary btn-sm">◔ Workflow Status</Link>
          )}

          {hasRole('Builder') && (
            <Link href="/workflows/review" className="btn btn-secondary btn-sm">◇ Workflow Review</Link>
          )}

          {hasRole('Admin') && (
            <Link href="/admin/workflows/status" className="btn btn-secondary btn-sm">◉ Workflow Monitor</Link>
          )}

          {(can('WRITE') || hasRole('Viewer')) && (
            <Link href="/builder/new" className="btn btn-primary btn-sm">+ New Form</Link>
          )}

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

          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>⎋ Logout</button>
        </div>
      </div>
    </nav>
  );
}
