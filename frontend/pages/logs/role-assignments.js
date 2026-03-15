import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getRoleAssignmentLogs, getRoles } from '../../services/api';
import { toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';
import PageContainer from '../../components/layout/PageContainer';
import SectionHeader from '../../components/layout/SectionHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Input from '../../components/ui/Input';

export default function RoleAssignmentLogsPage() {
    const router = useRouter();
    const { user, hasRole, loading: authLoading } = useAuth();

    const [rows, setRows] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        roleId: '',
        user: '',
        fromDate: '',
        toDate: '',
    });

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace('/login');
            return;
        }
        const allowed = hasRole('Role Administrator') || hasRole('Admin');
        if (!allowed) {
            router.replace('/dashboard');
            return;
        }

        loadRoles();
        loadLogs(filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user]);

    async function loadRoles() {
        try {
            const data = await getRoles();
            setRoles(Array.isArray(data) ? data : []);
        } catch {
            setRoles([]);
        }
    }

    async function loadLogs(currentFilters) {
        setLoading(true);
        try {
            const data = await getRoleAssignmentLogs(currentFilters);
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            toastError(err.message || 'Failed to load role logs.');
        } finally {
            setLoading(false);
        }
    }

    function applyFilters(e) {
        if (e) e.preventDefault();
        loadLogs(filters);
    }

    function clearFilters() {
        const next = { roleId: '', user: '', fromDate: '', toDate: '' };
        setFilters(next);
        loadLogs(next);
    }

    return (
        <>
            <Head>
                <title>RBAC Logs — FormCraft Admin</title>
            </Head>
            
            <PageContainer>
                <SectionHeader 
                    title="🔑 Role Assignment Logs"
                    subtitle="Audit trail of role changes and permission assignments across all platform users"
                    actions={
                        <div className="flex gap-2">
                             <Button variant="secondary" size="sm" onClick={clearFilters}>
                                Reset
                            </Button>
                            <Button variant="primary" size="sm" onClick={applyFilters}>
                                Search Logs
                            </Button>
                        </div>
                    }
                />

                <Card className="mb-8 p-4 bg-white/5 border-white/10 mt-6">
                    <form onSubmit={applyFilters} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <select
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all cursor-pointer"
                            value={filters.roleId}
                            onChange={(e) => setFilters((p) => ({ ...p, roleId: e.target.value }))}
                        >
                            <option value="">All Roles</option>
                            {roles.map((r) => (
                                <option key={r.id} value={r.id}>{r.roleName}</option>
                            ))}
                        </select>

                        <Input
                            placeholder="Target username"
                            value={filters.user}
                            onChange={(e) => setFilters((p) => ({ ...p, user: e.target.value }))}
                        />

                        <Input
                            type="date"
                            value={filters.fromDate}
                            onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
                        />

                        <Input
                            type="date"
                            value={filters.toDate}
                            onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
                        />
                    </form>
                </Card>

                <Card className="overflow-hidden border-white/5">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Timestamp</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Role Affected</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Target User</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Performed By</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <Spinner size="sm" />
                                                <span>Fetching RBAC audit records...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-400">
                                            No role assignment records found.
                                        </td>
                                    </tr>
                                ) : rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-4 text-xs text-gray-400 font-mono">
                                            {r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '-'}
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-semibold text-primary">
                                                {r.related_role_name || (r.related_role_id ? `Role #${r.related_role_id}` : '-')}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-900 dark:text-white">
                                            @{r.related_username || '-'}
                                        </td>
                                        <td className="p-4 text-sm text-gray-500 font-medium">
                                            @{r.performed_by_username || '-'}
                                        </td>
                                        <td className="p-4">
                                            <Badge variant={r.action === 'ASSIGN_ROLE' ? 'success' : 'danger'} className="font-mono text-[10px]">
                                                {r.action}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <div className="mt-8 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard')}>
                        Back to Dashboard
                    </Button>
                </div>
            </PageContainer>
        </>
    );
}
