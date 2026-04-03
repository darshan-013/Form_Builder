import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getMe } from '../services/api';

/**
 * AuthContext — global authentication and permission state.
 *
 * Fetches the user profile from GET /api/auth/me on mount (if session exists)
 * and stores: username, userId, name, email, roles[], permissions[].
 *
 * Components consume via:
 *   const { user, permissions, hasPermission, can, loading } = useAuth();
 *
 * Permission-gated rendering:
 *   if (hasPermission('MANAGE')) { ... }
 *   if (can('WRITE'))           { ... }
 */

const AuthContext = createContext({
    user: null,
    permissions: [],
    roles: [],
    loading: true,
    hasPermission: () => false,
    can: () => false,
    setUser: () => {},
    refreshAuth: () => Promise.resolve(),
    clearAuth: () => {},
});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);

    /**
     * Fetch current user from /api/auth/me.
     * Called on mount and after login.
     * Response shape: { username, userId, name, email, roles, permissions, authorities }
     */
    const refreshAuth = useCallback(async () => {
        try {
            const data = await getMe();
            setUser({
                username: data.username,
                userId: data.userId,
                name: data.name,
                email: data.email,
                profilePic: data.profilePic,
                authorities: data.authorities || [],
                role: (data.roles && data.roles.length > 0) ? data.roles[0].roleName : 'Viewer'
            });
            setRoles(data.roles || []);
            setPermissions(data.permissions || []);
            return data;
        } catch {
            // Not authenticated or session expired
            setUser(null);
            setRoles([]);
            setPermissions([]);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /** Clear auth state (on logout). */
    const clearAuth = useCallback(() => {
        setUser(null);
        setRoles([]);
        setPermissions([]);
    }, []);

    /**
     * Check if the current user has a specific permission.
     * @param {string} permKey - e.g. 'MANAGE', 'WRITE', 'READ'
     * @returns {boolean}
     */
    const hasPermission = useCallback((permKey) => {
        return permissions.includes(permKey);
    }, [permissions]);

    /** Alias for hasPermission — shorter syntax for JSX. */
    const can = hasPermission;

    /**
     * Check if the current user has a specific role.
     * @param {string} roleName - e.g. 'Admin', 'Manager'
     * @returns {boolean}
     */
    const hasRole = useCallback((roleName) => {
        return roles.some(r => r.roleName === roleName);
    }, [roles]);

    // Auto-fetch on mount (checks if session exists)
    useEffect(() => {
        refreshAuth();
    }, [refreshAuth]);

    return (
        <AuthContext.Provider value={{
            user,
            permissions,
            roles,
            loading,
            hasPermission,
            can,
            hasRole,
            setUser,
            refreshAuth,
            clearAuth,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to consume auth context.
 * @returns {{ user, permissions, roles, loading, hasPermission, can, hasRole, refreshAuth, clearAuth }}
 */
export function useAuth() {
    return useContext(AuthContext);
}

export default AuthContext;

