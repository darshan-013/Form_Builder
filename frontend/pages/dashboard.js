import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import UserProfileChip from '../components/UserProfileChip';
import { motion } from 'framer-motion';
import { FileText, CheckCircle, Edit3, MessageSquare } from 'lucide-react';
import { getDashboardStats } from '../services/api';
import { toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';
import { translateApiError } from '../services/errorTranslator';

export default function DashboardPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace('/login'); return; }

        getDashboardStats()
            .then(setStats)
            .catch(error => toastError(translateApiError(error)))
            .finally(() => setLoading(false));
    }, [authLoading, user, router]);

    const recentForms = useMemo(() => {
        const list = Array.isArray(stats?.recentForms) ? stats.recentForms : [];
        return list.slice(0, 10);
    }, [stats]);

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    const formatRelativeOrDate = (dt) => {
        if (!dt) return '-';
        const parsed = new Date(dt).getTime();
        if (Number.isNaN(parsed)) return formatDate(dt);
        const diffMin = Math.max(0, Math.floor((Date.now() - parsed) / 60000));
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}h ago`;
        return formatDate(dt);
    };

    return (
        <>
            <Head><title>Dashboard — FormCraft</title></Head>

            <div className="page">
                <Navbar />
                <UserProfileChip />
                <div className="container">

                    <div className="page-header">
                        <div>
                            <h1 className="page-title">Dashboard</h1>
                            <p className="page-subtitle">Overview of your forms and submission activity.</p>
                        </div>
                    </div>

                    <div className="dashboard-stats">
                        <motion.div
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                                <FileText size={20} color="#8B5CF6" />
                            </div>
                            <div className="stat-label">Total Forms</div>
                            <div className="stat-value">{stats?.totalForms ?? 0}</div>
                        </motion.div>

                        <motion.div
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                                <CheckCircle size={20} color="#10B981" />
                            </div>
                            <div className="stat-label">Published Forms</div>
                            <div className="stat-value">{stats?.publishedCount ?? 0}</div>
                        </motion.div>

                        <motion.div
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                                <Edit3 size={20} color="#F59E0B" />
                            </div>
                            <div className="stat-label">Draft Forms</div>
                            <div className="stat-value">{stats?.draftCount ?? 0}</div>
                        </motion.div>

                        <motion.div
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(6, 182, 212, 0.1)' }}>
                                <MessageSquare size={20} color="#06B6D4" />
                            </div>
                            <div className="stat-label">Total Submissions</div>
                            <div className="stat-value">{stats?.totalSubmissions ?? 0}</div>
                        </motion.div>

                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : (
                        <>
                            <section className="dashboard-section">
                                <div className="section-bar section-bar-draft">
                                    <div className="section-bar-top" style={{ alignItems: 'center' }}>
                                        <div className="section-bar-title">
                                            <span className="section-bar-icon">🗄</span>
                                            <h2 className="dashboard-section-title">Form Vault</h2>
                                        </div>
                                        <Link href="/forms/vault" className="btn btn-primary btn-sm">Open Vault</Link>
                                    </div>
                                    <div className="section-bar-bottom">
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            Manage all live and draft forms from a dedicated page with search, tabs, and bulk actions.
                                        </span>
                                    </div>
                                </div>
                            </section>

                            <section className="dashboard-section" style={{ marginTop: 16 }}>
                                <div className="section-bar section-bar-published">
                                    <div className="section-bar-top" style={{ alignItems: 'center' }}>
                                        <div className="section-bar-title">
                                            <span className="section-bar-icon">🕒</span>
                                            <h2 className="dashboard-section-title">Recent Activity</h2>
                                            <span className="dashboard-section-count">{recentForms.length}</span>
                                        </div>
                                    </div>
                                    <div className="section-bar-bottom" style={{ display: 'block' }}>
                                        {recentForms.length === 0 ? (
                                            <span style={{ color: 'var(--text-muted)' }}>No recent activity.</span>
                                        ) : (
                                            <div style={{ display: 'grid', gap: 6, width: '100%' }}>
                                                {recentForms.map((item, idx) => (
                                                    <div key={item.id || `${item.name || 'recent'}-${idx}`} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: 12,
                                                        padding: '12px 6px',
                                                        borderBottom: idx === recentForms.length - 1 ? 'none' : '1px solid var(--border)'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                                            <div style={{
                                                                width: 40,
                                                                height: 40,
                                                                borderRadius: 10,
                                                                background: 'rgba(99, 102, 241, 0.12)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                flexShrink: 0
                                                            }}>
                                                                ⏺
                                                            </div>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 700, color: 'var(--accent-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {item.name || 'Untitled Form'}
                                                                </div>
                                                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Last updated</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                            {formatRelativeOrDate(item.updatedAt || item.createdAt)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

