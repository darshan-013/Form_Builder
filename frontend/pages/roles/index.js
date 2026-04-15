import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import PaginationControls from '../../components/PaginationControls';
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
    const [viewMode, setViewMode] = useState('system');
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(10);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace('/login'); return; }
        loadRoles(0, size);
    }, [authLoading, user, router]);

    async function loadRoles(nextPage = page, nextSize = size) {
        try {
            const data = await getRoles({ page: nextPage, size: nextSize });
            const allRoles = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : []);
            // Filter out 'admin' role
            const visibleRoles = allRoles.filter(r => r.roleName.toLowerCase() !== 'admin');
            setRoles(visibleRoles);
            setPage(Array.isArray(data) ? nextPage : Number(data?.page ?? nextPage));
            setSize(Array.isArray(data) ? nextSize : Number(data?.size ?? nextSize));
            setTotalElements(Array.isArray(data) ? visibleRoles.length : Number(data?.totalElements ?? visibleRoles.length));
            setTotalPages(Array.isArray(data) ? (visibleRoles.length > 0 ? 1 : 0) : Number(data?.totalPages ?? 0));
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

    const visibleRoles = filtered.filter(r =>
        viewMode === 'all' ? true : viewMode === 'system' ? r.isSystemRole : !r.isSystemRole
    );
    const systemRoles = visibleRoles.filter(r => r.isSystemRole);
    const customRoles = visibleRoles.filter(r => !r.isSystemRole);

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteRole(deleteTarget.id);
            setRoles(prev => prev.filter(r => r.id !== deleteTarget.id));
            toastSuccess(`Role "${deleteTarget.roleName}" deleted.`);
            if (roles.length === 1 && page > 0) {
                await loadRoles(page - 1, size);
            } else {
                await loadRoles(page, size);
            }
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
                            {roleList.map((role, idx) => (
                                <tr 
                                    key={role.id}
                                    className="animate-fade-in stagger-item"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
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
                    <div className="roles-page-title-block">
                        <h1>Role Management</h1>
                        <p>Manage roles and their permission assignments</p>
                    </div>
                    <div className="roles-toolbar">
                        <div className="roles-filter-group">
                            <button
                                type="button"
                                className={`btn btn-sm ${viewMode === 'system' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setViewMode('system')}
                                aria-pressed={viewMode === 'system'}
                            >
                                System Roles
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${viewMode === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setViewMode('custom')}
                                aria-pressed={viewMode === 'custom'}
                            >
                                Custom Roles
                            </button>
                        </div>
                        <div className="roles-action-row">
                            <input
                                type="text"
                                className="form-input roles-search-input"
                                placeholder="Search roles or permissions..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <Link href="/roles/create" className="btn btn-primary roles-new-role-btn">
                                + New Role
                            </Link>
                        </div>
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
                        {viewMode === 'all' && renderTable(systemRoles, '🔒 System Roles')}
                        {viewMode === 'all' && renderTable(customRoles, '⚙️ Custom Roles')}
                        {viewMode === 'system' && renderTable(systemRoles, '🔒 System Roles')}
                        {viewMode === 'custom' && renderTable(customRoles, '⚙️ Custom Roles')}
                        {visibleRoles.length === 0 && (
                            <div className="roles-empty">
                                <p>
                                    {search
                                        ? `No roles match "${search}"${viewMode !== 'all' ? ` in ${viewMode} roles` : ''}`
                                        : viewMode === 'system'
                                            ? 'No system roles available.'
                                            : viewMode === 'custom'
                                                ? 'No custom roles available.'
                                                : 'No roles available.'}
                                </p>
                            </div>
                        )}
                        <PaginationControls
                            page={page}
                            size={size}
                            totalElements={totalElements}
                            totalPages={totalPages}
                            loading={loading}
                            onPageChange={(nextPage) => loadRoles(nextPage, size)}
                            onSizeChange={(nextSize) => loadRoles(0, nextSize)}
                        />
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