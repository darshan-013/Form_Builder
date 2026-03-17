import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getRoles, deleteRole } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

export default function RolesPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace('/login'); return; }
        loadRoles();
    }, [authLoading, user, router]);

    async function loadRoles() {
        try {
            const data = await getRoles();
            const allRoles = Array.isArray(data) ? data : [];
            // Filter out 'admin' role
            setRoles(allRoles.filter(r => r.roleName.toLowerCase() !== 'admin'));
        } catch (err) {
            if (err.status === 403) {
                toastError('You do not have permission to manage roles.');
                router.replace('/dashboard');
            } else {
                toastError('Failed to load roles.');
            }
        } finally {
            setLoading(false);
        }
    }

    const filtered = roles.filter(r =>
        r.roleName.toLowerCase().includes(search.toLowerCase()) ||
        (r.permissions || []).some(p => p.toLowerCase().includes(search.toLowerCase()))
    );

    const systemRoles = filtered.filter(r => r.isSystemRole);
    const customRoles = filtered.filter(r => !r.isSystemRole);

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteRole(deleteTarget.id);
            setRoles(prev => prev.filter(r => r.id !== deleteTarget.id));
            toastSuccess(`Role "${deleteTarget.roleName}" deleted.`);
        } catch (err) {
            toastError(err.message || 'Failed to delete role.');
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    }

    function renderTable(roleList, title) {
        if (roleList.length === 0) return null;
        return (
            <>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 24 }}>
                    {title} ({roleList.length})
                </h2>
                <div className="roles-table-wrap">
                    <table className="roles-table">
                        <thead>
                            <tr>
                                <th>Role</th>
                                <th>Type</th>
                                <th>Permissions</th>
                                <th style={{ width: 100 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roleList.map(role => (
                                <tr key={role.id}>
                                    <td data-label="Role">
                                        <div className="role-name-cell">
                                            <div className={`role-icon ${role.isSystemRole ? 'system' : 'custom'}`}>
                                                {role.isSystemRole ? '🔒' : '⚙️'}
                                            </div>
                                            {role.roleName}
                                        </div>
                                    </td>
                                    <td data-label="Type">
                                        <span className={`badge ${role.isSystemRole ? 'badge-system' : 'badge-custom'}`}>
                                            {role.isSystemRole ? 'System' : 'Custom'}
                                        </span>
                                    </td>
                                    <td data-label="Permissions">
                                        <div className="perm-tags">
                                            {(role.permissions || []).map(p => (
                                                <span key={p} className="perm-tag">{p}</span>
                                            ))}
                                            {(!role.permissions || role.permissions.length === 0) && (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No permissions</span>
                                            )}
                                        </div>
                                    </td>
                                    <td data-label="Actions">
                                        <div className="role-actions">
                                            {!role.isSystemRole && (
                                                <>
                                                    <button
                                                        className="role-action-btn"
                                                        title="Edit role"
                                                        onClick={() => router.push(`/roles/edit/${role.id}`)}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className="role-action-btn danger"
                                                        title="Delete role"
                                                        onClick={() => setDeleteTarget(role)}
                                                    >
                                                        🗑️
                                                    </button>
                                                </>
                                            )}
                                            {role.isSystemRole && (
                                                <button
                                                    className="role-action-btn"
                                                    title="View role details"
                                                    onClick={() => router.push(`/roles/edit/${role.id}`)}
                                                >
                                                    👁️
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </>
        );
    }

    return (
        <>
            <Head>
                <title>Role Management — FormCraft</title>
            </Head>
            <Navbar />

            <div className="roles-page">
                <div className="roles-page-header">
                    <div>
                        <h1>🛡️ Role Management</h1>
                        <p>Manage roles and their permission assignments</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search roles or permissions..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: 260 }}
                        />
                        <Link href="/roles/create" className="btn btn-primary">
                            + New Role
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="roles-skeleton">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="roles-skeleton-row" />
                        ))}
                    </div>
                ) : roles.length === 0 ? (
                    <div className="roles-empty">
                        <div className="roles-empty-icon">🛡️</div>
                        <h3>No roles found</h3>
                        <p>Create your first custom role to get started.</p>
                        <Link href="/roles/create" className="btn btn-primary">
                            + Create Role
                        </Link>
                    </div>
                ) : (
                    <>
                        {renderTable(systemRoles, '🔒 System Roles')}
                        {renderTable(customRoles, '⚙️ Custom Roles')}
                        {filtered.length === 0 && search && (
                            <div className="roles-empty">
                                <p>No roles match "{search}"</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="role-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
                    <div className="role-modal" onClick={e => e.stopPropagation()}>
                        <h3>Delete Role</h3>
                        <p>
                            Are you sure you want to delete <strong>"{deleteTarget.roleName}"</strong>?
                            This will remove the role from all assigned users. This action cannot be undone.
                        </p>
                        <div className="role-modal-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? 'Deleting...' : 'Delete Role'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}