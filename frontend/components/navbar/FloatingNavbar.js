import { useMemo } from 'react';
import { useRouter } from 'next/router';
import NavItem from './NavItem';
import NavbarContainer from './NavbarContainer';

function resolveIcon(iconKey) {
    const icons = {
        home: '⌂',
        dashboard: '◈',
        users: '◎',
        workflows: '◌',
        review: '✓',
        forms: '+',
        settings: '⚙',
        status: '◔',
        search: '⌕',
        notifications: '◉',
        profile: '◍',
        login: '→',
        signup: '✦',
        logout: '⎋',
        theme: '◐',
        features: '◇',
    };
    return icons[iconKey] || '•';
}

export default function FloatingNavbar({
    items,
    onAction,
    variant = 'app',
    profileText,
}) {
    const router = useRouter();

    const normalized = useMemo(() => {
        return (items || []).map((item) => ({
            ...item,
            icon: resolveIcon(item.iconKey),
        }));
    }, [items]);

    function isItemActive(item) {
        if (item.isActive) return true;
        if (!item.route) return false;
        const route = item.route.split('?')[0];
        if (route === '/') return router.pathname === '/';
        return router.pathname === route || router.pathname.startsWith(`${route}/`);
    }

    return (
        <NavbarContainer variant={variant}>
            {profileText ? <div className="dock-profile-chip">{profileText}</div> : null}

            <nav className="dock-navbar" aria-label="Main Navigation">
                <div className="dock-navbar-track">
                    {normalized.map((item) => (
                        <NavItem
                            key={item.key}
                            item={item}
                            isActive={isItemActive(item)}
                            onActivate={(event) => {
                                if (item.onClick) {
                                    item.onClick(event);
                                }
                                if (onAction) {
                                    onAction(item, event);
                                }
                            }}
                        />
                    ))}
                </div>
            </nav>
        </NavbarContainer>
    );
}
