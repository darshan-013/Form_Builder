import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getRoles, deleteRole } from '../../services/api';
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
            setRoles(Array.isArray(data) ? data : []);
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

    function renderTable(roleList, title, icon) {
        if (roleList.length === 0) return null;
        return (
            <div className="space-y-4 mb-10" key={title}>
                <div className="flex items-center gap-2 px-1">
                    <span className="text-xl">{icon}</span>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                        {title}
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-white/5 rounded-full text-sm font-medium text-gray-500">
                            {roleList.length}
                        </span>
                    </h2>
                </div>
                
                <Card className="roles-table-wrap overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="roles-table w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">Role</th>
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">Permissions</th>
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                {roleList.map(role => (
                                    <tr key={role.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm group-hover:scale-110 transition-transform ${role.isSystemRole ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                                                    {role.isSystemRole ? '🔒' : '⚙️'}
                                                </div>
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    {role.roleName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1.5 max-w-md">
                                                {(role.permissions || []).map(p => (
                                                    <Badge key={p} variant="text">
                                                        {p}
                                                    </Badge>
                                                ))}
                                                {(!role.permissions || role.permissions.length === 0) && (
                                                    <span className="text-xs text-gray-400">No permissions</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!role.isSystemRole ? (
                                                    <>
                                                        <Button 
                                                            variant="secondary" 
                                                            size="xs" 
                                                            onClick={() => router.push(`/roles/edit/${role.id}`)}
                                                            title="Edit role"
                                                        >
                                                            ✏️
                                                        </Button>
                                                        <Button 
                                                            variant="danger" 
                                                            size="xs" 
                                                            onClick={() => setDeleteTarget(role)}
                                                            title="Delete role"
                                                        >
                                                            🗑️
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button 
                                                        variant="secondary" 
                                                        size="xs" 
                                                        onClick={() => router.push(`/roles/edit/${role.id}`)}
                                                        title="View details"
                                                    >
                                                        👁️
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Role Management — FormCraft</title>
            </Head>

            <PageContainer>
                <SectionHeader 
                    title="🛡️ Role Management"
                    subtitle="Manage roles and their permission assignments"
                    actions={
                        <div className="flex items-center gap-3">
                            <Input
                                placeholder="Search roles..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-64"
                            />
                            <Link href="/roles/create">
                                <Button variant="primary">+ New Role</Button>
                            </Link>
                        </div>
                    }
                />

                {loading ? (
                    <div className="space-y-8">
                        <div>
                            <Skeleton className="h-6 w-48 mb-4" />
                            <Card className="p-6 space-y-4">
                                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                            </Card>
                        </div>
                        <div>
                            <Skeleton className="h-6 w-48 mb-4" />
                            <Card className="p-6 space-y-4">
                                {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                            </Card>
                        </div>
                    </div>
                ) : roles.length === 0 ? (
                    <div className="p-20 text-center space-y-4">
                        <div className="text-5xl opacity-20">🛡️</div>
                        <h3 className="text-xl font-bold">No roles found</h3>
                        <p className="text-gray-500 max-w-sm mx-auto">Create your first custom role to get started.</p>
                        <Link href="/roles/create">
                            <Button variant="primary">+ Create Role</Button>
                        </Link>
                    </div>
                ) : (
                    <>
                        {renderTable(systemRoles, 'System Roles', '🔒')}
                        {renderTable(customRoles, 'Custom Roles', '⚙️')}
                        
                        {filtered.length === 0 && search && (
                            <div className="p-10 text-center text-amber-500 font-medium">
                                No roles match &quot;{search}&quot;
                            </div>
                        )}
                    </>
                )}
            </PageContainer>

            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Role"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                            {deleting ? 'Deleting...' : 'Delete Role'}
                        </Button>
                    </>
                }
            >
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                        🗑️
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                        Are you sure you want to delete <strong>&quot;{deleteTarget?.roleName}&quot;</strong>?<br />
                        This will remove the role from all assigned users. This action cannot be undone.
                    </p>
                </div>
            </Modal>
        </>
    );
}