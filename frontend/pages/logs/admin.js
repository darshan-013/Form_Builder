import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAdminLogs } from '../../services/api';
import { toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';
import PageContainer from '../../components/layout/PageContainer';
import SectionHeader from '../../components/layout/SectionHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Input from '../../components/ui/Input';

const ACTIONS = [
    'CREATE_FORM', 'UPDATE_FORM', 'DELETE_FORM', 'PUBLISH_FORM', 'UNPUBLISH_FORM', 'SUBMIT_FORM',
    'CREATE_ROLE', 'UPDATE_ROLE', 'DELETE_ROLE', 'ASSIGN_ROLE', 'REMOVE_ROLE', 'UPDATE_PERMISSION'
];

export default function AdminLogsPage() {
    const router = useRouter();
    const { user, hasRole, loading: authLoading } = useAuth();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        action: '',
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
        if (!hasRole('Admin')) {
            router.replace('/dashboard');
            return;
        }
        loadLogs(filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user]);

    async function loadLogs(currentFilters) {
        setLoading(true);
        try {
            const data = await getAdminLogs(currentFilters);
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            toastError(err.message || 'Failed to load admin logs.');
        } finally {
            setLoading(false);
        }
    }

    function applyFilters(e) {
        if (e) e.preventDefault();
        loadLogs(filters);
    }

    function clearFilters() {
        const next = { action: '', user: '', fromDate: '', toDate: '' };
        setFilters(next);
        loadLogs(next);
    }

    return (
        <>
            <Head>
                <title>System Audit Logs — FormCraft Admin</title>
            </Head>
            
            <PageContainer>
                <SectionHeader 
                    title="📜 System Audit Logs"
                    subtitle="Track every critical action performed across the platform for security and auditing"
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
                            value={filters.action}
                            onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))}
                        >
                            <option value="">All Actions</option>
                            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>

                        <Input
                            placeholder="Username"
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
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">User</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Action</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Target</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-400">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <Spinner size="sm" />
                                                <span>Fetching audit details...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-400">
                                            No audit records found matching your filters.
                                        </td>
                                    </tr>
                                ) : rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-4 text-xs text-gray-400 font-mono">
                                            {r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '-'}
                                        </td>
                                        <td className="p-4 text-sm font-semibold text-gray-900 dark:text-white">
                                            @{r.performed_by_username || '-'}
                                        </td>
                                        <td className="p-4">
                                            <Badge variant="ghost" className="font-mono text-[10px]">
                                                {r.action}
                                            </Badge>
                                        </td>
                                        <td className="p-4 text-sm text-primary font-medium">
                                            {r.target_entity}{r.target_entity_id ? `:${r.target_entity_id}` : ''}
                                        </td>
                                        <td className="p-4 text-sm text-gray-500 max-w-xs truncate" title={r.description}>
                                            {r.description}
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
