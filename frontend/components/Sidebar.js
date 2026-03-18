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

            // Initialize expanded items for segments that contain the active path (Recursive)
            const initialExpanded = {};

            const checkExpansion = (items, path) => {
                let foundMatch = false;
                items.forEach(item => {
                    let subMatch = false;
                    if (item.subItems) {
                        subMatch = checkExpansion(item.subItems, path);
                    }

                    if (item.href === path || subMatch) {
                        initialExpanded[item.label] = true;
                        foundMatch = true;
                    }
                });
                return foundMatch;
            };

            data?.forEach(section => {
                checkExpansion(section.items, router.pathname);
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

    const renderMenuItem = (item, level = 0, index = 0) => {
        const hasSubItems = item.subItems && item.subItems.length > 0;
        const isExpanded = !!expandedItems[item.label];
        const isActive = router.pathname === item.href;

        return (
            <div
                key={item.href + item.label}
                className="sb-menu-group"
                style={{ '--i': index }}
            >
                <div
                    className={`sb-menu-item ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''} ${hasSubItems ? 'has-sub' : ''} level-${level}`}
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
                        <span className={`sb-submenu-indicator ${isExpanded ? 'open' : ''}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </span>
                    )}
                </div>
                {hasSubItems && (
                    <div className={`sb-submenu ${isExpanded ? 'show' : ''}`}>
                        {item.subItems.map((sub, sIdx) => renderMenuItem(sub, level + 1, index + sIdx + 1))}
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
                    <div className="sb-logo">
                        <span className="sb-logo-icon">⚡</span>
                        <h2>FormCraft</h2>
                    </div>
                    <button className="sb-close-btn" onClick={onClose} aria-label="Close Sidebar">✕</button>
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
                                {section.items.map((item, iIdx) => renderMenuItem(item, 0, iIdx))}
                                {sIdx < menuData.length - 1 && <div className="sb-divider" />}
                            </div>
                        ))
                    )}
                </div>

                <div className="sb-footer">
                    {user && (
                        <div className="sb-user-card">
                            <div className="sb-avatar-glow">👤</div>
                            <div className="sb-user-info">
                                <span className="sb-username">{user.username}</span>
                                <span className="sb-user-role">{roleDisplay}</span>
                            </div>
                        </div>
                    )}

                    <div className="sb-footer-actions">
                        <button className="sb-action-btn sb-theme-toggle" onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>
                        <button className="sb-action-btn sb-logout-btn" onClick={handleLogout} title="Logout">
                            ⎋
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
