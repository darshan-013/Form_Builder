import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import { getRoleAssignmentLogs, getRoles } from '../../services/api';
import { toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

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
            const allRoles = Array.isArray(data) ? data : [];
            // Filter out 'admin' role
            setRoles(allRoles.filter(r => r.roleName.toLowerCase() !== 'admin'));
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
        e.preventDefault();
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
                <title>Role Assignment Logs - FormCraft</title>
            </Head>
            <Navbar />

            <div className="users-page">
                <div className="users-page-header">
                    <div>
                        <h1>Role Assignment Logs</h1>
                        <p>Track role assignment and permission update activity.</p>
                    </div>
                </div>

                <form onSubmit={applyFilters} className="user-form-card" style={{ marginBottom: 16, maxWidth: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 10 }}>
                        <select
                            className="form-input"
                            value={filters.roleId}
                            onChange={(e) => setFilters((p) => ({ ...p, roleId: e.target.value }))}
                        >
                            <option value="">All Roles</option>
                            {roles.map((r) => (
                                <option key={r.id} value={r.id}>{r.roleName}</option>
                            ))}
                        </select>

                        <input
                            className="form-input"
                            placeholder="Filter by username"
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
                                <th>Role</th>
                                <th>User</th>
                                <th>Assigned By</th>
                                <th>Action</th>
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
                                    <td>{r.related_role_name || (r.related_role_id ? `Role #${r.related_role_id}` : '-')}</td>
                                    <td>{r.related_username || '-'}</td>
                                    <td>{r.performed_by_username || '-'}</td>
                                    <td><span className="perm-tag">{r.action}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

