import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { logout, getMenu } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';

export default function Sidebar({ isOpen, onClose }) {
    const router = useRouter();
    const { user, roles, clearAuth } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [menuData, setMenuData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedItems, setExpandedItems] = useState({});

    useEffect(() => {
        if (isOpen && user) {
            fetchMenu();
        }
    }, [isOpen, user]);

    const fetchMenu = async () => {
        try {
            const data = await getMenu();
            setMenuData(data || []);

            // Initialize expanded items for segments that contain the active path
            const initialExpanded = {};
            data?.forEach(section => {
                section.items.forEach(item => {
                    if (item.subItems?.some(sub => router.pathname === sub.href)) {
                        initialExpanded[item.label] = true;
                    }
                });
            });
            setExpandedItems(initialExpanded);
        } catch (err) {
            console.error('Failed to fetch menu:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            clearAuth();
            toastSuccess('You have been logged out.');
            router.push('/login');
            onClose();
        } catch {
            toastError('Logout failed. Please try again.');
        }
    };

    const toggleExpand = (label) => {
        setExpandedItems(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

    const roleDisplay = roles && roles.length > 0
        ? roles.map(r => r.roleName).join(', ')
        : 'Viewer';

    const renderMenuItem = (item, level = 0) => {
        const hasSubItems = item.subItems && item.subItems.length > 0;
        const isExpanded = !!expandedItems[item.label];
        const isActive = router.pathname === item.href;

        return (
            <div key={item.href + item.label} className="sb-menu-group">
                <div
                    className={`sb-menu-item ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''} level-${level}`}
                    onClick={() => {
                        if (hasSubItems) {
                            toggleExpand(item.label);
                        } else if (item.href) {
                            router.push(item.href);
                            onClose();
                        }
                    }}
                >
                    <span className="sb-menu-icon">{item.icon || '•'}</span>
                    <span className="sb-menu-text">{item.label}</span>
                    {hasSubItems && (
                        <span className={`sb-submenu-indicator ${isExpanded ? 'open' : ''}`}>▾</span>
                    )}
                </div>
                {hasSubItems && (
                    <div className={`sb-submenu ${isExpanded ? 'show' : ''}`}>
                        {item.subItems.map(sub => renderMenuItem(sub, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div className={`sb-overlay ${isOpen ? 'show' : ''}`} onClick={onClose} />
            <div className={`sb-container ${isOpen ? 'open' : ''}`}>
                <div className="sb-header">
                    <h2>⚡ FormCraft</h2>
                    <button className="sb-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="sb-content">
                    {loading ? (
                        <div className="sb-loading">
                            <div className="sb-spinner-sm" />
                        </div>
                    ) : (
                        menuData.map((section, sIdx) => (
                            <div key={section.section} className="sb-section">
                                <div className="sb-section-title">{section.section}</div>
                                {section.items.map(item => renderMenuItem(item))}
                                {sIdx < menuData.length - 1 && <div className="sb-divider" />}
                            </div>
                        ))
                    )}
                </div>

                <div className="sb-footer">
                    {user && (
                        <div className="sb-user-info">
                            <div className="sb-user-avatar">👤</div>
                            <div className="sb-user-details">
                                <span className="sb-username">{user.username}</span>
                                <span className="sb-user-role">{roleDisplay}</span>
                            </div>
                        </div>
                    )}

                    <div className="sb-footer-actions">
                        <button className="sb-footer-btn sb-theme-toggle" onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>
                        <button className="sb-footer-btn sb-logout-btn" onClick={handleLogout} title="Logout">
                            ⎋
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
