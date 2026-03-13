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

    // Display the highest-priority role name
    const roleDisplay = roles && roles.length > 0
        ? roles.map(r => r.roleName).join(', ')
        : 'Viewer';

    return (
        <nav className="navbar">
            <Link href="/dashboard" className="navbar-brand">
                ⚡ FormCraft
            </Link>
            <div className="navbar-actions">
                {user && (
                    <span style={{
                        fontSize: 11, color: 'var(--text-muted)',
                        padding: '4px 10px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', gap: 6,
                        whiteSpace: 'nowrap'
                    }}>
                        👤 {user.username} <span style={{ opacity: 0.5 }}>|</span> {roleDisplay}
                    </span>
                )}

                <Link href="/dashboard" className="btn btn-secondary btn-sm">
                    Dashboard
                </Link>

                {can('MANAGE') && (
                    <Link href="/roles" className="btn btn-secondary btn-sm">
                        🛡️ Roles
                    </Link>
                )}

                {can('MANAGE') && (
                    <Link href="/users" className="btn btn-secondary btn-sm">
                        👤 Users
                    </Link>
                )}

                {hasRole('Admin') && (
                    <Link href="/logs/admin" className="btn btn-secondary btn-sm">
                        Audit Logs
                    </Link>
                )}

                {hasRole('Role Administrator') && (
                    <Link href="/logs/role-assignments" className="btn btn-secondary btn-sm">
                        Role Logs
                    </Link>
                )}

                {can('WRITE') && (
                    <Link href="/builder/new" className="btn btn-primary btn-sm">
                        + New Form
                    </Link>
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
                <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                    Logout
                </button>
            </div>
        </nav>
    );
}
