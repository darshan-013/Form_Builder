import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import DataTable from '../../components/DataTable';
import { getForm, getSubmissions, downloadFile } from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';

/**
 * Submissions View Page — /submissions/[id]
 *
 * Displays all submissions for a specific form in a DataTable
 * Features:
 * - Search submissions
 * - Sort by any column
 * - Paginated view
 * - View raw JSON data
 * - Export functionality (future enhancement)
 */
export default function SubmissionsPage() {
    const router = useRouter();
    const { id } = router.query;

    const [form, setForm] = useState(null);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);

    // Handle file download
    const handleFileDownload = async (filename) => {
        try {
            await downloadFile(filename);
            toastSuccess('File downloaded successfully');
        } catch (error) {
            console.error('Download failed:', error);
            toastError('Failed to download file');
        }
    };

    useEffect(() => {
        if (!id) return;

        Promise.all([
            getForm(id),
            getSubmissions(id)
        ])
            .then(([formData, submissionsData]) => {
                setForm(formData);
                setSubmissions(Array.isArray(submissionsData) ? submissionsData : []);
            })
            .catch((err) => {
                console.error('Failed to load submissions:', err);
                toastError('Failed to load submissions data.');
            })
            .finally(() => setLoading(false));
    }, [id]);

    // Generate columns from form fields
    const columns = () => {
        if (!form || !form.fields) return [];

        const cols = [
            {
                key: 'id',
                label: 'ID',
                sortable: true,
                render: (value) => value ? String(value).substring(0, 8) + '...' : '—'
            },
            ...form.fields.map(field => ({
                key: field.fieldKey,
                label: field.label,
                sortable: true,
                render: (value) => {
                    if (value === null || value === undefined) return '—';

                    // Handle boolean
                    if (field.fieldType === 'boolean') {
                        return value ? '✓ Yes' : '✗ No';
                    }

                    // Handle file
                    if (field.fieldType === 'file' && value) {
                        const filename = String(value);
                        return (
                            <button
                                onClick={() => handleFileDownload(filename)}
                                className="btn-file-download"
                                title="Click to download file"
                            >
                                📎 {filename.length > 30 ? filename.substring(0, 30) + '...' : filename}
                            </button>
                        );
                    }

                    // Handle date
                    if (field.fieldType === 'date' && value) {
                        return new Date(value).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                        });
                    }

                    // Truncate long text
                    const strValue = String(value);
                    return strValue.length > 50 ? strValue.substring(0, 50) + '...' : strValue;
                }
            })),
            {
                key: 'created_at',
                label: 'Submitted At',
                sortable: true,
                render: (value) => value ? new Date(value).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '—'
            },
            {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (_, row) => (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedSubmission(row)}
                        title="View details"
                    >
                        👁 View
                    </button>
                )
            }
        ];

        return cols;
    };

    const formatDate = (dt) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    return (
        <>
            <Head>
                <title>{form?.name ? `${form.name} — Submissions` : 'Submissions'} — FormCraft</title>
                <meta name="description" content="View form submissions" />
            </Head>

            <div className="page">
                <Navbar />

                <div className="container">
                    {/* Header */}
                    <div className="page-header">
                        <div>
                            <Link href="/dashboard" className="breadcrumb-link">
                                ← Back to Dashboard
                            </Link>
                            <h1 className="page-title">
                                {form?.name || 'Form'} — Submissions
                            </h1>
                            <p className="page-subtitle">
                                {form?.description || 'View all submitted responses'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Link href={`/submit/${id}`} className="btn btn-secondary" target="_blank">
                                📝 Submit Form
                            </Link>
                            <Link href={`/preview/${id}`} className="btn btn-secondary">
                                👁 Preview Form
                            </Link>
                        </div>
                    </div>

                    {/* Stats */}
                    {form && (
                        <div className="dashboard-stats" style={{ marginBottom: '32px' }}>
                            <div className="stat-card">
                                <div className="stat-value">{submissions.length}</div>
                                <div className="stat-label">Total Submissions</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{form.fields?.length || 0}</div>
                                <div className="stat-label">Form Fields</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">
                                    {form.createdAt ? formatDate(form.createdAt) : '—'}
                                </div>
                                <div className="stat-label">Form Created</div>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div className="loading-center">
                            <span className="spinner" style={{ width: 48, height: 48 }} />
                            <p style={{ marginTop: '16px', color: '#64748b' }}>Loading submissions...</p>
                        </div>
                    )}

                    {/* Data Table */}
                    {!loading && form && (
                        <div className="submissions-table-container">
                            <DataTable
                                data={submissions}
                                columns={columns()}
                                pageSize={10}
                            />
                        </div>
                    )}

                    {/* No Form State */}
                    {!loading && !form && (
                        <div className="empty-state">
                            <div className="empty-state-icon">⚠️</div>
                            <h3>Form not found</h3>
                            <p>The requested form could not be loaded</p>
                            <br />
                            <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
                        </div>
                    )}
                </div>
            </div>

            {/* View Submission Modal */}
            {selectedSubmission && (
                <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
                    <div className="modal-box" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Submission Details</h2>
                            <button className="modal-close" onClick={() => setSelectedSubmission(null)}>×</button>
                        </div>

                        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            {/* Submission ID */}
                            <div className="form-group">
                                <label className="form-label">Submission ID</label>
                                <div className="form-input" style={{ background: '#f8fafc', fontFamily: 'monospace', fontSize: '13px' }}>
                                    {selectedSubmission.id}
                                </div>
                            </div>

                            {/* Submitted At */}
                            <div className="form-group">
                                <label className="form-label">Submitted At</label>
                                <div className="form-input" style={{ background: '#f8fafc' }}>
                                    {selectedSubmission.created_at ? new Date(selectedSubmission.created_at).toLocaleString('en-IN') : '—'}
                                </div>
                            </div>

                            <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                            {/* Field Values */}
                            {form?.fields?.map((field) => (
                                <div key={field.fieldKey} className="form-group">
                                    <label className="form-label">
                                        {field.label}
                                        {field.required && <span className="form-field-required-star">*</span>}
                                    </label>
                                    <div className="form-input" style={{ background: '#f8fafc', minHeight: field.fieldType === 'text' && selectedSubmission[field.fieldKey]?.length > 100 ? '80px' : 'auto' }}>
                                        {(() => {
                                            const value = selectedSubmission[field.fieldKey];

                                            if (value === null || value === undefined || value === '') {
                                                return <span style={{ color: '#94a3b8' }}>No value provided</span>;
                                            }

                                            if (field.fieldType === 'boolean') {
                                                return value ? '✓ Yes' : '✗ No';
                                            }

                                            if (field.fieldType === 'file') {
                                                const filename = String(value);
                                                return (
                                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                        <button
                                                            onClick={() => handleFileDownload(filename)}
                                                            className="btn btn-secondary btn-sm"
                                                            title="Download file"
                                                        >
                                                            💾 Download
                                                        </button>
                                                        <span style={{ fontSize: '13px', color: '#64748b' }}>
                                                            📎 {filename.length > 40 ? filename.substring(0, 40) + '...' : filename}
                                                        </span>
                                                    </div>
                                                );
                                            }

                                            if (field.fieldType === 'date') {
                                                return new Date(value).toLocaleDateString('en-IN');
                                            }

                                            return value;
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSelectedSubmission(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}





