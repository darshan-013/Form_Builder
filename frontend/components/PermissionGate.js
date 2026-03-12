import { useAuth } from '../context/AuthContext';

/**
 * PermissionGate — Declarative permission-based rendering.
 *
 * Usage:
 *   <PermissionGate permission="MANAGE">
 *     <Link href="/roles">Roles</Link>
 *   </PermissionGate>
 *
 *   <PermissionGate permission="WRITE" fallback={<span>Read-only</span>}>
 *     <button>Create Form</button>
 *   </PermissionGate>
 *
 *   <PermissionGate anyOf={['MANAGE', 'VISIBILITY']}>
 *     <AdminPanel />
 *   </PermissionGate>
 *
 *   <PermissionGate allOf={['WRITE', 'EDIT']}>
 *     <FullEditor />
 *   </PermissionGate>
 *
 * Props:
 *   permission  — single permission key required
 *   anyOf       — array: render if user has ANY of these
 *   allOf       — array: render if user has ALL of these
 *   role        — single role name required
 *   fallback    — optional JSX to render when denied (default: null)
 *   children    — content to render when permitted
 */
export default function PermissionGate({
    permission,
    anyOf,
    allOf,
    role,
    fallback = null,
    children,
}) {
    const { hasPermission, hasRole, loading } = useAuth();

    // While auth is loading, render nothing (prevents flash)
    if (loading) return null;

    let allowed = false;

    if (permission) {
        // Single permission check
        allowed = hasPermission(permission);
    } else if (anyOf && Array.isArray(anyOf)) {
        // Any of the listed permissions
        allowed = anyOf.some(p => hasPermission(p));
    } else if (allOf && Array.isArray(allOf)) {
        // All of the listed permissions
        allowed = allOf.every(p => hasPermission(p));
    } else if (role) {
        // Role-based check
        allowed = hasRole(role);
    } else {
        // No condition specified — render children
        allowed = true;
    }

    return allowed ? children : fallback;
}

