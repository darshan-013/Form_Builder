import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import UserProfileChip from '../components/UserProfileChip';
import { motion } from 'framer-motion';
import { 
    FileText, Calendar, Edit3, BarChart3, Copy, 
    ExternalLink, Eye, Trash2, CheckCircle, MessageSquare, Archive
} from 'lucide-react';
import { getDashboardStats } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';
import { translateApiError } from '../services/errorTranslator';

export default function DashboardPage() {
    const router = useRouter();
    const { user, hasRole, loading: authLoading } = useAuth();
    const isAdmin = hasRole('Admin') || user?.role === 'Admin';
    const isBuilder = hasRole('Builder') || user?.role === 'Builder';
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

    const handleCopyLink = (formId) => {
        const url = `${window.location.origin}/submit/${formId}`;
        navigator.clipboard.writeText(url)
            .then(() => toastSuccess('Submission link copied to clipboard!'))
            .catch(() => toastError('Failed to copy link.'));
    };

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

    const renderRecentRow = (form) => {
        const status = form.status?.toUpperCase();
        const isPublished = status === 'PUBLISHED';
        const isDraft = status === 'DRAFT' || !status;
        
        return (
            <div key={form.id} className={`recent-row-v2 animate-in ${isPublished ? 'row-published' : 'row-draft'}`}>
                <div className="row-main-info">
                    <div className="row-thumb">
                        <FileText size={18} color="#3B82F6" />
                    </div>
                    <div className="row-name-wrap">
                        <span className="row-name">{form.name}</span>
                        <div className={`status-pill-v2 pill-xs ${isPublished ? 'pill-published' : 'pill-draft'}`}>
                            <span className="pill-dot"></span>
                            {isPublished ? 'Published' : (form.status || 'Draft').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                        </div>
                    </div>
                </div>

                <div className="row-actions-wrap">
                    <div className="row-date">{formatRelativeOrDate(form.updatedAt || form.createdAt)}</div>
                    <div className="row-toolbar">
                        {(isAdmin || user?.username === form.createdBy || user?.username === form.assignedBuilderUsername) && (
                            <button className="row-icon-btn" title="Edit Form" onClick={() => router.push(`/builder/${form.id}`)}>
                                <Edit3 size={16} />
                            </button>
                        )}
                        {status === 'ASSIGNED' && (isAdmin || user?.username === form.assignedBuilderUsername) && (
                            <button className="row-icon-btn" title="Initiate Workflow" onClick={() => router.push(`/workflows/create/${form.id}`)} style={{ color: '#10B981' }}>
                                <CheckCircle size={16} />
                            </button>
                        )}
                        {isPublished && (
                            <>
                                <button className="row-icon-btn" title="Submissions" onClick={() => router.push(`/submissions/${form.id}`)}>
                                    <BarChart3 size={16} />
                                </button>
                                <button className="row-icon-btn" title="Copy Link" onClick={() => handleCopyLink(form.id)}>
                                    <Copy size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Head><title>Dashboard — FormCraft</title></Head>

            <div className="page">
                <Navbar />
                <UserProfileChip />
                <div className="container" style={{ paddingBottom: '100px' }}>

                    <div className="page-header">
                        <div>
                            <h1 className="page-title">Dashboard</h1>
                            <p className="page-subtitle">Overview of your forms and submission activity.</p>
                        </div>
                    </div>

                    <div className="dashboard-stats-v2">
                        <motion.div className="stat-card-v2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                            <div className="stat-header">
                                <div className="stat-icon-v2" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                                    <FileText size={20} />
                                </div>
                                <span className="stat-trend">+12%</span>
                            </div>
                            <div className="stat-info">
                                <div className="stat-value-v2">{stats?.totalForms ?? 0}</div>
                                <div className="stat-label-v2">Total Forms</div>
                            </div>
                        </motion.div>

                        <motion.div className="stat-card-v2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                            <div className="stat-header">
                                <div className="stat-icon-v2" style={{ background: '#ECFDF5', color: '#10B981' }}>
                                    <CheckCircle size={20} />
                                </div>
                                <span className="stat-trend success">Active</span>
                            </div>
                            <div className="stat-info">
                                <div className="stat-value-v2">{stats?.publishedCount ?? 0}</div>
                                <div className="stat-label-v2">Published</div>
                            </div>
                        </motion.div>

                        <motion.div className="stat-card-v2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                            <div className="stat-header">
                                <div className="stat-icon-v2" style={{ background: '#FFF7ED', color: '#F59E0B' }}>
                                    <Edit3 size={20} />
                                </div>
                            </div>
                            <div className="stat-info">
                                <div className="stat-value-v2">{stats?.draftCount ?? 0}</div>
                                <div className="stat-label-v2">Drafts</div>
                            </div>
                        </motion.div>

                        <motion.div className="stat-card-v2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
                            <div className="stat-header">
                                <div className="stat-icon-v2" style={{ background: '#F0FDFA', color: '#0D9488' }}>
                                    <MessageSquare size={20} />
                                </div>
                                <span className="stat-trend info">New</span>
                            </div>
                            <div className="stat-info">
                                <div className="stat-value-v2">{stats?.totalSubmissions ?? 0}</div>
                                <div className="stat-label-v2">Submissions</div>
                            </div>
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

                            <section className="dashboard-section-v2">
                                <div className="section-header-v2">
                                    <div className="section-title-wrap">
                                        <div className="section-icon-v2">🕒</div>
                                        <h2 className="section-title-v2">Recent Forms</h2>
                                        <span className="section-badge-v2">{recentForms.length}</span>
                                    </div>
                                    <Link href="/forms/vault" className="view-all-link">
                                        View All Vault <ExternalLink size={14} />
                                    </Link>
                                </div>

                                {recentForms.length === 0 ? (
                                    <div className="empty-state-v2">
                                        <Archive size={40} />
                                        <p>No recent activity found. Start by creating a new form!</p>
                                    </div>
                                ) : (
                                    <div className="recent-list-v2">
                                        {recentForms.slice(0, 6).map(renderRecentRow)}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

