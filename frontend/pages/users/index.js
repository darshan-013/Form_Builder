import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getUsers, deleteUser } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';
import PageContainer from '../../components/layout/PageContainer';
import SectionHeader from '../../components/layout/SectionHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';

export default function UsersPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace('/login'); return; }
        loadUsers();
    }, [authLoading, user, router]);

    async function loadUsers() {
        try {
            const data = await getUsers();
            setUsers(Array.isArray(data) ? data : []);
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

            <PageContainer>
                <SectionHeader 
                    title="👤 User Management"
                    subtitle="Manage users and their role assignments"
                    actions={
                        <Input
                            placeholder="Search users..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-64"
                        />
                    }
                />

                <Card className="users-table-wrap overflow-hidden">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : users.length === 0 ? (
                        <div className="p-20 text-center space-y-4">
                            <div className="text-5xl opacity-20">👤</div>
                            <h3 className="text-xl font-bold">No users found</h3>
                            <p className="text-gray-500 max-w-sm mx-auto">Users will appear here after they register. You can then assign roles to them.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="users-table w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">User</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">Email</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">Roles</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                    {filtered.map(user => (
                                        <tr key={user.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-500 group-hover:scale-110 transition-transform">
                                                        {getInitials(user)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-gray-900 dark:text-white">
                                                            {user.name || '—'}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            @{user.username}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {user.email ? (
                                                    <a href={`mailto:${user.email}`} className="text-sm text-indigo-500 hover:underline">{user.email}</a>
                                                ) : (
                                                    <span className="text-sm text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(user.roles || []).map(role => (
                                                        <Badge key={role.id} variant={role.isSystemRole ? 'text' : 'number'}>
                                                            {role.roleName}
                                                        </Badge>
                                                    ))}
                                                    {(!user.roles || user.roles.length === 0) && (
                                                        <span className="text-xs text-gray-400">No roles</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button 
                                                        variant="secondary" 
                                                        size="xs" 
                                                        onClick={() => router.push(`/users/edit/${user.id}`)}
                                                        title="Edit user"
                                                    >
                                                        ✏️
                                                    </Button>
                                                    <Button 
                                                        variant="danger" 
                                                        size="xs" 
                                                        onClick={() => setDeleteTarget(user)}
                                                        title="Delete user"
                                                    >
                                                        🗑️
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <div className="mt-6 flex justify-between items-center text-sm text-gray-500">
                    <p>Showing {filtered.length} of {users.length} users</p>
                    {filtered.length === 0 && search && (
                        <p className="text-amber-500 font-medium">No users match &quot;{search}&quot;</p>
                    )}
                </div>
            </PageContainer>

            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete User"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                            {deleting ? 'Deleting...' : 'Delete User'}
                        </Button>
                    </>
                }
            >
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                        🗑️
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                        Are you sure you want to delete <strong>&quot;{deleteTarget?.name || deleteTarget?.username}&quot;</strong>?<br />
                        All role assignments will be removed. This action cannot be undone.
                    </p>
                </div>
            </Modal>
        </>
    );
}



