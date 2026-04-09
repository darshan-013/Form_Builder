import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import PaginationControls from '../../components/PaginationControls';
import { getAdminLogs } from '../../services/api';
import { toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

const ACTIONS = [
    'CREATE_FORM', 'UPDATE_FORM', 'DELETE_FORM', 'PUBLISH_FORM', 'UNPUBLISH_FORM', 'SUBMIT_FORM',
    'CREATE_ROLE', 'UPDATE_ROLE', 'DELETE_ROLE', 'ASSIGN_ROLE', 'REMOVE_ROLE', 'UPDATE_PERMISSION'
];

export default function AdminLogsPage() {
    const router = useRouter();
    const { user, hasRole, loading: authLoading } = useAuth();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(10);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
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
        loadLogs(filters, 0, size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user]);

    async function loadLogs(currentFilters, nextPage = page, nextSize = size) {
        setLoading(true);
        try {
            const data = await getAdminLogs({ ...currentFilters, page: nextPage, size: nextSize });
            const content = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : []);
            setRows(content);
            setPage(Array.isArray(data) ? nextPage : Number(data?.page ?? nextPage));
            setSize(Array.isArray(data) ? nextSize : Number(data?.size ?? nextSize));
            setTotalElements(Array.isArray(data) ? content.length : Number(data?.totalElements ?? content.length));
            setTotalPages(Array.isArray(data) ? (content.length > 0 ? 1 : 0) : Number(data?.totalPages ?? 0));
        } catch (err) {
            toastError(err.message || 'Failed to load admin logs.');
        } finally {
            setLoading(false);
        }
    }

    function applyFilters(e) {
        e.preventDefault();
        setPage(0);
        loadLogs(filters, 0, size);
    }

    function clearFilters() {
        const next = { action: '', user: '', fromDate: '', toDate: '' };
        setFilters(next);
        setPage(0);
        loadLogs(next, 0, size);
    }

    return (
        <>
            <Head>
                <title>Admin Logs - FormCraft</title>
            </Head>
            <Navbar />

            <div className="users-page">
                <div className="users-page-header">
                    <div>
                        <h1>Admin Logs</h1>
                        <p>Complete audit trail of important system actions.</p>
                    </div>
                </div>

                <form onSubmit={applyFilters} className="user-form-card" style={{ marginBottom: 16, maxWidth: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 10 }}>
                        <select
                            className="form-input"
                            value={filters.action}
                            onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))}
                        >
                            <option value="">All Actions</option>
                            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>

                        <input
                            className="form-input"
                            placeholder="Filter by user"
                            value={filters.user}
                            onChange={(e) => setFilters((p) => ({ ...p, user: e.target.value }))}
                        />

                        <input
                            type="date"
                            className="form-input"
                            value={filters.fromDate}
                            onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
                        />

                        <input
                            type="date"
                            className="form-input"
                            value={filters.toDate}
                            onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
                        />
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Apply</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear</button>
                    </div>
                </form>

                <div className="users-table-wrap">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Target</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5}>Loading logs...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={5}>No logs found.</td></tr>
                            ) : rows.map((r, idx) => (
                                <tr 
                                    key={r.id}
                                    className="animate-fade-in stagger-item"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                                    <td>{r.performed_by_username || '-'}</td>
                                    <td><span className="perm-tag">{r.action}</span></td>
                                    <td>{r.target_entity}{r.target_entity_id ? `:${r.target_entity_id}` : ''}</td>
                                    <td>{r.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <PaginationControls
                    page={page}
                    size={size}
                    totalElements={totalElements}
                    totalPages={totalPages}
                    loading={loading}
                    onPageChange={(nextPage) => loadLogs(filters, nextPage, size)}
                    onSizeChange={(nextSize) => loadLogs(filters, 0, nextSize)}
                />
            </div>
        </>
    );
}

