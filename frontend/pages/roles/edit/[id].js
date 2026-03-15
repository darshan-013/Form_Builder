import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

import PermissionCheckboxGroups from '../../../components/PermissionCheckboxGroups';
import { getRole, updateRole } from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';
import { useAuth } from '../../../context/AuthContext';

export default function EditRolePage() {
    const router = useRouter();
    const { id } = router.query;
    const { user, loading: authLoading } = useAuth();

    const [name, setName] = useState('');
    const [permissions, setPermissions] = useState([]);
    const [originalRole, setOriginalRole] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id || authLoading) return;
        if (!user) { router.replace('/login'); return; }
        loadRole().finally(() => setLoading(false));
    }, [id, authLoading, user, router]);

    async function loadRole() {
        try {
            const role = await getRole(id);
            setOriginalRole(role);
            setName(role.roleName);
            setPermissions(role.permissions || []);
        } catch (err) {
            if (err.status === 403) {
                toastError('You do not have permission to edit roles.');
                router.replace('/dashboard');
            } else if (err.status === 404) {
                toastError('Role not found.');
                router.replace('/roles');
            } else {
                toastError('Failed to load role.');
                router.replace('/roles');
            }
        }
    }

    const isSystemRole = originalRole?.isSystemRole;

    async function handleSubmit(e) {
        e.preventDefault();
        if (isSystemRole) return; // safety guard
        setError('');

        if (!name.trim()) {
            setError('Role name is required.');
            return;
        }
        if (permissions.length === 0) {
            setError('Select at least one permission.');
            return;
        }

        setSaving(true);
        try {
            await updateRole(id, {
                name: name.trim(),
                permissions
            });
            toastSuccess(`Role "${name.trim()}" updated successfully.`);
            router.push('/roles');
        } catch (err) {
            const msg = err.message || 'Failed to update role.';
            setError(msg);
            toastError(msg);
        } finally {
            setSaving(false);
        }
    }

    // Check for unsaved changes
    const hasChanges = !isSystemRole && originalRole && (
        name.trim() !== originalRole.roleName ||
        JSON.stringify([...permissions].sort()) !== JSON.stringify([...(originalRole.permissions || [])].sort())
    );

    if (loading) {
        return (
            <>
                <Head><title>Edit Role — FormCraft</title></Head>

                <div className="roles-page">
                    <div className="roles-skeleton">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="roles-skeleton-row" />
                        ))}
                    </div>
                </div>
            </>
        );
    }

    if (!originalRole) return null;

    return (
        <>
            <Head>
                <title>{isSystemRole ? 'View' : 'Edit'} {originalRole.roleName} — FormCraft</title>
            </Head>


            <div className="roles-page">
                <div className="roles-page-header">
                    <div>
                        <h1>{isSystemRole ? '👁️ View' : '✏️ Edit'} Role: {originalRole.roleName}</h1>
                        <p>{isSystemRole
                            ? 'System role — permissions are read-only'
                            : 'Update the role name and permission assignments'}</p>
                    </div>
                    <Link href="/roles" className="btn btn-secondary">
                        ← Back to Roles
                    </Link>
                </div>

                <div className="role-form-card">
                    {/* System role info banner */}
                    {isSystemRole && (
                        <div style={{
                            padding: '12px 16px', marginBottom: 20,
                            background: 'rgba(59,130,246,0.1)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            borderRadius: 'var(--radius-sm)',
                            color: '#93C5FD', fontSize: 14
                        }}>
                            🔒 This is a system role. Its name and permissions cannot be modified.
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
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

                        {/* Role Name */}
                        <div className="form-group" style={{ marginBottom: 24 }}>
                            <label className="form-label" htmlFor="role-name">
                                Role Name {!isSystemRole && '*'}
                            </label>
                            <input
                                id="role-name"
                                type="text"
                                className="form-input"
                                placeholder="e.g. Regional Auditor, Finance Reviewer..."
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus={!isSystemRole}
                                maxLength={100}
                                disabled={isSystemRole}
                                style={isSystemRole ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                            />
                            {isSystemRole && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                                    System role names cannot be changed.
                                </span>
                            )}
                        </div>

                        {/* Permissions */}
                        <div className="form-group">
                            <label className="form-label">
                                Permissions {!isSystemRole && '*'}
                            </label>
                            <PermissionCheckboxGroups
                                selected={permissions}
                                onChange={setPermissions}
                                disabled={isSystemRole}
                            />
                        </div>

                        {/* Actions — only show for custom roles */}
                        {!isSystemRole && (
                            <div className="role-form-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving || !hasChanges}
                                >
                                    {saving ? 'Saving...' : '✓ Save Changes'}
                                </button>
                                <Link href="/roles" className="btn btn-secondary">
                                    Cancel
                                </Link>
                                {!hasChanges && !saving && (
                                    <span style={{
                                        fontSize: 12, color: 'var(--text-muted)',
                                        alignSelf: 'center', marginLeft: 8
                                    }}>
                                        No changes to save
                                    </span>
                                )}
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </>
    );
}
