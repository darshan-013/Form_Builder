import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { logout, getMenu } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';

export default function Sidebar({ isOpen, onClose }) {
    const DESKTOP_BREAKPOINT = 1024;
    const router = useRouter();
    const { user, roles, clearAuth } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [menuData, setMenuData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedItems, setExpandedItems] = useState({});
    const [collapsedSections, setCollapsedSections] = useState({});
    const [isDesktop, setIsDesktop] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const syncViewport = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
        syncViewport();
        window.addEventListener('resize', syncViewport);

        const savedCollapsed = window.localStorage.getItem('sidebar_collapsed');
        if (savedCollapsed === '1') setIsCollapsed(true);

        return () => window.removeEventListener('resize', syncViewport);
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const offset = isDesktop ? (isCollapsed ? '86px' : '320px') : '0px';
        document.documentElement.style.setProperty('--sidebar-offset', offset);

        document.body.classList.toggle('sb-desktop', isDesktop);
        document.body.classList.toggle('sb-collapsed', isDesktop && isCollapsed);

        return () => {
            document.documentElement.style.setProperty('--sidebar-offset', '0px');
            document.body.classList.remove('sb-desktop');
            document.body.classList.remove('sb-collapsed');
        };
    }, [isDesktop, isCollapsed]);

    const shouldShowSidebar = isDesktop || isOpen;

    useEffect(() => {
        if (shouldShowSidebar && user) {
            fetchMenu();
        }
    }, [shouldShowSidebar, user]);

    const fetchMenu = async () => {
        try {
            const data = await getMenu();
            const normalizedMenu = Array.isArray(data) ? [...data] : [];

            const generalIndex = normalizedMenu.findIndex((section) => section?.section === 'General');
            const formVaultItem = { label: 'Form Vault', href: '/forms/vault', icon: '🗄' };
            const docsItem = { label: 'API Docs', href: '/docs', icon: '📚' };

            if (generalIndex >= 0) {
                const items = Array.isArray(normalizedMenu[generalIndex].items) ? [...normalizedMenu[generalIndex].items] : [];
                
                // Add Form Vault if missing
                if (!items.some((item) => item?.href === '/forms/vault')) {
                    items.push(formVaultItem);
                }
                
                // Add API Docs if missing
                if (!items.some((item) => item?.href === '/docs')) {
                    items.push(docsItem);
                }
                
                normalizedMenu[generalIndex] = { ...normalizedMenu[generalIndex], items };
            } else {
                normalizedMenu.unshift({ section: 'General', items: [formVaultItem, docsItem] });
            }

            setMenuData(normalizedMenu);

            // Initialize expanded items for segments that contain the active path
            const initialExpanded = {};
            normalizedMenu.forEach(section => {
                section.items.forEach(item => {
                    if (item.subItems?.some(sub => router.pathname === sub.href)) {
                        initialExpanded[item.label] = true;
                    }
                });
            });
            setExpandedItems(initialExpanded);
        } catch (err) {
            // Session expired or unauthorized - handle gracefully
            if (err?.status === 401) {
                console.warn('Session expired, redirecting to login');
                router.push('/login?expired=true');
                return;
            }
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

    const toggleSection = (sectionName) => {
        setCollapsedSections(prev => ({
            ...prev,
            [sectionName]: !prev[sectionName]
        }));
    };

    const toggleCollapse = () => {
        if (!isDesktop) {
            onClose();
            return;
        }
        const next = !isCollapsed;
        setIsCollapsed(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
        }
    };

    const roleDisplay = roles && roles.length > 0
        ? roles.map(r => r.roleName).join(', ')
        : 'Viewer';

    const renderMenuItem = (item, level = 0) => {
        const hasSubItems = item.subItems && item.subItems.length > 0;
        const isExpanded = !!expandedItems[item.label];
        const isActive = router.pathname === item.href;

        const canRenderSubmenu = hasSubItems && !isCollapsed;

        return (
            <div key={item.href + item.label} className="sb-menu-group">
                <div 
                    className={`sb-menu-item ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''} level-${level}`} 
                    onClick={() => { 
                        if (hasSubItems && !isCollapsed) {
                            toggleExpand(item.label);
                        } else if (item.href) {
                            router.push(item.href); 
                            if (!isDesktop) onClose();
                        }
                    }}
                    title={isCollapsed ? item.label : undefined}
                >
                    <span className="sb-menu-icon">{item.icon || '•'}</span>
                    {!isCollapsed && <span className="sb-menu-text">{item.label}</span>}
                    {canRenderSubmenu && (
                        <span className={`sb-submenu-indicator ${isExpanded ? 'open' : ''}`}>▾</span>
                    )}
                </div>
                {canRenderSubmenu && (
                    <div className={`sb-submenu ${isExpanded ? 'show' : ''}`}>
                        {item.subItems.map(sub => renderMenuItem(sub, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div className={`sb-overlay ${!isDesktop && isOpen ? 'show' : ''}`} onClick={onClose} />
            <div className={`sb-container ${shouldShowSidebar ? 'open' : ''} ${isDesktop ? 'desktop-fixed' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="sb-header">
                    {!isCollapsed && <h2>⚡ FormCraft</h2>}
                    <button className="sb-close-btn sb-collapse-btn" onClick={toggleCollapse} title={isDesktop ? (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar') : 'Close sidebar'}>
                        {isDesktop ? (isCollapsed ? '»' : '«') : '✕'}
                    </button>
                </div>

                <div className="sb-content">
                    {loading ? (
                        <div className="sb-loading">
                            <div className="sb-spinner-sm" />
                        </div>
                    ) : (
                        menuData.map((section, sIdx) => (
                            <div key={section.section} className="sb-section">
                                <button
                                    type="button"
                                    className={`sb-section-title sb-section-toggle ${collapsedSections[section.section] ? 'collapsed' : ''}`}
                                    onClick={() => toggleSection(section.section)}
                                    title={collapsedSections[section.section] ? 'Expand section' : 'Collapse section'}
                                >
                                    <span>{section.section}</span>
                                    <span className="sb-section-chevron">▾</span>
                                </button>
                                {!collapsedSections[section.section] && (
                                    <>
                                        {section.items.map(item => renderMenuItem(item))}
                                        {sIdx < menuData.length - 1 && <div className="sb-divider" />}
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="sb-footer">
                    {user && (
                        <div 
                            className="sb-user-info" 
                            onClick={() => { router.push('/profile'); if (!isDesktop) onClose(); }}
                            style={{ cursor: 'pointer' }}
                            title="View Profile"
                        >
                            <div className="sb-user-avatar">{(user.username || 'U').slice(0, 1).toUpperCase()}</div>
                            <div className="sb-user-details" style={{ marginLeft: '8px' }}>
                                <span className="sb-username">{user.username}</span>
                                <span className="sb-user-role">{roleDisplay}</span>
                            </div>
                        </div>
                    )}

                    <div className="sb-footer-actions">
                        <button
                            className="sb-footer-btn sb-theme-toggle theme-toggle-btn"
                            onClick={(e) => toggleTheme(e)}
                            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                            aria-label="Toggle theme"
                        >
                            <span className={`theme-toggle-icon ${theme === 'dark' ? 'icon-sun' : 'icon-moon'}`}>
                                {theme === 'dark' ? '☀️' : '🌙'}
                            </span>
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
