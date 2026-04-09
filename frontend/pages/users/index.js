import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Navbar from '../../components/Navbar';
import PaginationControls from '../../components/PaginationControls';
import { getUsers, deleteUser } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

export default function UsersPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(10);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace('/login'); return; }
        loadUsers(0, size);
    }, [authLoading, user, router]);

    async function loadUsers(nextPage = page, nextSize = size) {
        try {
            const data = await getUsers({ page: nextPage, size: nextSize });
            const rawUsers = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : []);
            // Filter out users who have the 'admin' role
            const filteredUsers = rawUsers.filter(u =>
                !(u.roles || []).some(r => r.roleName.toLowerCase() === 'admin')
            );
            setUsers(filteredUsers);
            setPage(Array.isArray(data) ? nextPage : Number(data?.page ?? nextPage));
            setSize(Array.isArray(data) ? nextSize : Number(data?.size ?? nextSize));
            setTotalElements(Array.isArray(data) ? filteredUsers.length : Number(data?.totalElements ?? filteredUsers.length));
            setTotalPages(Array.isArray(data) ? (filteredUsers.length > 0 ? 1 : 0) : Number(data?.totalPages ?? 0));
        } catch (err) {
            if (err.status === 403) {
                toastError('You do not have permission to manage users.');
                router.replace('/dashboard');
            } else {
                toastError('Failed to load users.');
            }
        } finally {
            setLoading(false);
        }
    }

    const filtered = users.filter(u => {
        const q = search.toLowerCase();
        return (
            (u.name || '').toLowerCase().includes(q) ||
            (u.username || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.roles || []).some(r => r.roleName.toLowerCase().includes(q))
        );
    });

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const result = await deleteUser(deleteTarget.id);
            setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));

            const rejected = Number(result?.rejectedWorkflows || 0);
            const creatorMoved = Number(result?.creatorRefsMoved || 0);
            const targetMoved = Number(result?.targetRefsMoved || 0);
            const stepsMoved = Number(result?.stepRefsMoved || 0);

            const impactBits = [];
            if (rejected > 0) impactBits.push(`${rejected} workflow${rejected !== 1 ? 's' : ''} rejected`);
            if (creatorMoved > 0) impactBits.push(`${creatorMoved} creator ref${creatorMoved !== 1 ? 's' : ''} moved`);
            if (targetMoved > 0) impactBits.push(`${targetMoved} target ref${targetMoved !== 1 ? 's' : ''} moved`);
            if (stepsMoved > 0) impactBits.push(`${stepsMoved} step ref${stepsMoved !== 1 ? 's' : ''} moved`);

            const base = `User "${deleteTarget.name || deleteTarget.username}" deleted.`;
            toastSuccess(impactBits.length ? `${base} Impact: ${impactBits.join(', ')}.` : base);
            if (users.length === 1 && page > 0) {
                await loadUsers(page - 1, size);
            } else {
                await loadUsers(page, size);
            }
        } catch (err) {
            toastError(err.message || 'Failed to delete user.');
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    }

    function getInitials(user) {
        if (user.name) {
            return user.name.split(' ').map(w => w[0]).join('').slice(0, 2);
        }
        return user.username ? user.username.slice(0, 2) : '?';
    }

    return (
        <>
            <Head>
                <title>User Management — FormCraft</title>
            </Head>
            <Navbar />

            <div className="users-page">
                <div className="users-page-header">
                    <div>
                        <h1>👤 User Management</h1>
                        <p>Manage users and their role assignments</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search users, emails, roles..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: 260 }}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="users-skeleton">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="users-skeleton-row" />
                        ))}
                    </div>
                ) : users.length === 0 ? (
                    <div className="users-empty">
                        <div className="users-empty-icon">👤</div>
                        <h3>No users found</h3>
                        <p>Users will appear here after they register. You can then assign roles to them.</p>
                    </div>
                ) : (
                    <>
                        <div className="users-table-wrap">
                            <table className="users-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Email</th>
                                        <th>Roles</th>
                                        <th style={{ width: 100 }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((user, idx) => (
                                        <tr 
                                            key={user.id}
                                            className="animate-fade-in stagger-item"
                                            style={{ animationDelay: `${idx * 0.05}s` }}
                                        >
                                            <td data-label="User">
                                                <div className="user-name-cell">
                                                    <div className="user-avatar">
                                                        {getInitials(user)}
                                                    </div>
                                                    <div className="user-name-info">
                                                        <span className="user-display-name">
                                                            {user.name || '—'}
                                                        </span>
                                                        <span className="user-username">
                                                            @{user.username}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="Email">
                                                <div className="user-email">
                                                    {user.email ? (
                                                        <a href={`mailto:${user.email}`}>{user.email}</a>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td data-label="Roles">
                                                <div className="role-tags">
                                                    {(user.roles || []).slice(0, 1).map(role => (
                                                        <span
                                                            key={role.id}
                                                            className={`role-tag ${role.isSystemRole ? 'system-tag' : 'custom-tag'}`}
                                                        >
                                                            {role.isSystemRole ? '🔒' : '⚙️'} {role.roleName}
                                                        </span>
                                                    ))}
                                                    {(!user.roles || user.roles.length === 0) && (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No roles</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td data-label="Actions">
                                                <div className="user-actions">
                                                    <button
                                                        className="user-action-btn"
                                                        title="Edit user"
                                                        onClick={() => router.push(`/users/edit/${user.id}`)}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className="user-action-btn danger"
                                                        title="Delete user"
                                                        onClick={() => setDeleteTarget(user)}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filtered.length === 0 && search && (
                            <div className="users-empty">
                                <p>No users match &quot;{search}&quot;</p>
                            </div>
                        )}

                        <PaginationControls
                            page={page}
                            size={size}
                            totalElements={totalElements}
                            totalPages={totalPages}
                            loading={loading}
                            onPageChange={(nextPage) => loadUsers(nextPage, size)}
                            onSizeChange={(nextSize) => loadUsers(0, nextSize)}
                        />
                    </>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="user-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
                    <div className="user-modal" onClick={e => e.stopPropagation()}>
                        <h3>Delete User</h3>
                        <p>
                            Are you sure you want to delete <strong>&quot;{deleteTarget.name || deleteTarget.username}&quot;</strong>?
                            All role assignments will be removed. This action cannot be undone.
                        </p>
                        <div className="user-modal-actions">
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
                                {deleting ? 'Deleting...' : 'Delete User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}



