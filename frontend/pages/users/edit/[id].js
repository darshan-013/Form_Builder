import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import {
    getUser, updateUser, getRoles,
    assignRoleToUser, removeRoleFromUser
} from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';
import { useAuth } from '../../../context/AuthContext';

export default function EditUserPage() {
    const router = useRouter();
    const { id } = router.query;
    const { user: authUser, loading: authLoading } = useAuth();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [originalUser, setOriginalUser] = useState(null);
    const [allRoles, setAllRoles] = useState([]);
    const [userRoleIds, setUserRoleIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [roleLoading, setRoleLoading] = useState(null); // roleId being toggled
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id || authLoading) return;
        if (!authUser) { router.replace('/login'); return; }
        Promise.all([loadUser(), loadRoles()])
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id, authLoading, authUser, router]);

    async function loadUser() {
        try {
            const user = await getUser(id);
            setOriginalUser(user);
            setName(user.name || '');
            setEmail(user.email || '');
            setUserRoleIds(new Set((user.roles || []).map(r => r.id)));
        } catch (err) {
            if (err.status === 403) {
                toastError('You do not have permission to edit users.');
                router.replace('/dashboard');
            } else if (err.status === 404) {
                toastError('User not found.');
                router.replace('/users');
            } else {
                toastError('Failed to load user.');
                router.replace('/users');
            }
        }
    }

    async function loadRoles() {
        try {
            const data = await getRoles();
            setAllRoles(Array.isArray(data) ? data : []);
        } catch {
            // Non-critical — roles section just won't show
        }
    }

    // Profile save (name + email only)
    async function handleSaveProfile(e) {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            const updated = await updateUser(id, {
                name: name.trim() || null,
                email: email.trim() || null
            });
            setOriginalUser(updated);
            toastSuccess('User profile updated.');
        } catch (err) {
            const msg = err.message || 'Failed to update user.';
            setError(msg);
            toastError(msg);
        } finally {
            setSaving(false);
        }
    }

    // Toggle role assignment (instant — no form submit needed)
    async function handleToggleRole(roleId) {
        setRoleLoading(roleId);
        try {
            let updated;
            if (userRoleIds.has(roleId)) {
                updated = await removeRoleFromUser(id, roleId);
                toastSuccess('Role removed.');
            } else {
                updated = await assignRoleToUser(id, roleId);
                toastSuccess('Role assigned.');
            }
            // Refresh user state from response
            setOriginalUser(updated);
            setUserRoleIds(new Set((updated.roles || []).map(r => r.id)));
        } catch (err) {
            toastError(err.message || 'Failed to update role.');
        } finally {
            setRoleLoading(null);
        }
    }

    const profileChanged = originalUser && (
        (name.trim() || '') !== (originalUser.name || '') ||
        (email.trim() || '') !== (originalUser.email || '')
    );

    if (loading) {
        return (
            <>
                <Head><title>Edit User — FormCraft</title></Head>
                <Navbar />
                <div className="users-page">
                    <div className="users-skeleton">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="users-skeleton-row" />
                        ))}
                    </div>
                </div>
            </>
        );
    }

    if (!originalUser) return null;

    return (
        <>
            <Head>
                <title>Edit {originalUser.name || originalUser.username} — FormCraft</title>
            </Head>
            <Navbar />

            <div className="users-page">
                <div className="users-page-header">
                    <div>
                        <h1>Edit User: {originalUser.name || originalUser.username}</h1>
                        <p>Update profile information and manage role assignments</p>
                    </div>
                    <Link href="/users" className="btn btn-secondary">
                        ← Back to Users
                    </Link>
                </div>

                <div className="user-form-card">
                    {/* Error Banner */}
                    {error && (
                        <div style={{
                            padding: '12px 16px', marginBottom: 20,
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 'var(--radius-sm)',
                            color: '#FCA5A5', fontSize: 14
                        }}>
                            ⚠ {error}
                        </div>
                    )}

                    {/* ── Profile Section ───────────────────── */}
                    <form onSubmit={handleSaveProfile}>
                        <h2>Profile Information</h2>

                        {/* Username (read-only) */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label">Username</label>
                            <input
                                type="text"
                                className="form-input"
                                value={originalUser.username}
                                disabled
                                style={{ opacity: 0.5, cursor: 'not-allowed' }}
                            />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Username cannot be changed after creation.
                            </span>
                        </div>

                        {/* Display Name */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label" htmlFor="name">
                                Display Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                className="form-input"
                                placeholder="e.g. John Doe"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        {/* Email */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label" htmlFor="email">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                placeholder="e.g. john@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                maxLength={150}
                            />
                        </div>

                        {/* Save Profile */}
                        <div className="user-form-actions" style={{ borderTop: 'none', marginTop: 8, paddingTop: 0 }}>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={saving || !profileChanged}
                            >
                                {saving ? 'Saving...' : '✓ Save Profile'}
                            </button>
                            {!profileChanged && !saving && (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                                    No profile changes to save
                                </span>
                            )}
                        </div>
                    </form>

                    {/* ── Role Assignment Section ────────────── */}
                    {allRoles.length > 0 && (
                        <div className="role-assign-section">
                            <h3>Role Assignments</h3>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                Click to assign or remove roles instantly. Changes are saved automatically.
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 16 }}>
                                {userRoleIds.size} role{userRoleIds.size !== 1 ? 's' : ''} assigned
                            </span>

                            {/* Current roles as chips */}
                            {userRoleIds.size > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                                        Current Roles
                                    </span>
                                    <div className="current-roles-list">
                                        {(originalUser.roles || []).map(role => (
                                            <span
                                                key={role.id}
                                                className={`current-role-chip ${role.isSystemRole ? 'system-chip' : 'custom-chip'}`}
                                            >
                                                {role.isSystemRole ? '🔒' : '⚙️'} {role.roleName}
                                                <span
                                                    className="chip-remove"
                                                    title={`Remove ${role.roleName}`}
                                                    onClick={() => handleToggleRole(role.id)}
                                                >
                                                    ✕
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* All roles grid with checkboxes */}
                            <div className="role-assign-grid">
                                {allRoles.map(role => {
                                    const isAssigned = userRoleIds.has(role.id);
                                    const isToggling = roleLoading === role.id;

                                    return (
                                        <label
                                            key={role.id}
                                            className={`role-assign-item ${isAssigned ? 'assigned' : ''}`}
                                            style={isToggling ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isAssigned}
                                                onChange={() => handleToggleRole(role.id)}
                                                disabled={isToggling}
                                            />
                                            <div className="role-assign-label">
                                                <span className="role-assign-name">
                                                    {role.isSystemRole ? '🔒' : '⚙️'} {role.roleName}
                                                    {isToggling && ' …'}
                                                </span>
                                                <span className="role-assign-type">
                                                    {role.isSystemRole ? 'System' : 'Custom'} · {(role.permissions || []).length} permissions
                                                </span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Effective permissions display */}
                            {originalUser.permissions && originalUser.permissions.length > 0 && (
                                <div style={{ marginTop: 20 }}>
                                    <span style={{
                                        fontSize: 11, color: 'var(--text-muted)',
                                        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
                                        display: 'block', marginBottom: 8
                                    }}>
                                        Effective Permissions
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {originalUser.permissions.map(p => (
                                            <span key={p} className="perm-tag">{p}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
