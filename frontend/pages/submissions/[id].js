import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import DataTable from '../../components/DataTable';
import { getForm, getSubmissions, downloadFile, deleteSubmission, updateSubmission, getFormRender } from '../../services/api';
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
    const [renderData, setRenderData] = useState(null); // Stores /render response with resolved options
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);

    // Edit state
    const [editingSubmission, setEditingSubmission] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [editLoading, setEditLoading] = useState(false);

    // Delete state
    const [deletingSubmission, setDeletingSubmission] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

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

    const loadData = () => {
        if (!id) return;
        setLoading(true);
        Promise.all([getForm(id), getFormRender(id), getSubmissions(id)])
            .then(([formData, renderFormData, submissionsData]) => {
                setForm(formData);
                setRenderData(renderFormData); // Store render data with resolved options
                setSubmissions(Array.isArray(submissionsData) ? submissionsData : []);
            })
            .catch((err) => {
                console.error('Failed to load submissions:', err);
                toastError('Failed to load submissions data.');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, [id]);

    // Open edit modal
    const openEdit = (submission) => {
        const initialData = {};
        if (form?.fields) {
            form.fields.forEach((field) => {
                if (field.fieldType !== 'file') {
                    const val = submission[field.fieldKey];
                    initialData[field.fieldKey] = val !== null && val !== undefined ? String(val) : '';
                }
            });
        }
        setEditFormData(initialData);
        setEditingSubmission(submission);
    };

    // Handle edit field change
    const handleEditChange = (fieldKey, value) => {
        setEditFormData((prev) => ({ ...prev, [fieldKey]: value }));
    };

    // Submit edit
    const handleEditSubmit = async () => {
        if (!editingSubmission) return;
        setEditLoading(true);
        try {
            await updateSubmission(id, editingSubmission.id, editFormData);
            toastSuccess('Submission updated successfully');
            setEditingSubmission(null);
            loadData();
        } catch (err) {
            console.error('Update failed:', err);
            toastError(err.message || 'Failed to update submission');
        } finally {
            setEditLoading(false);
        }
    };

    // Confirm delete
    const handleDeleteConfirm = async () => {
        if (!deletingSubmission) return;
        setDeleteLoading(true);
        try {
            await deleteSubmission(id, deletingSubmission.id);
            toastSuccess('Submission deleted successfully');
            setDeletingSubmission(null);
            setSubmissions((prev) => prev.filter((s) => s.id !== deletingSubmission.id));
        } catch (err) {
            console.error('Delete failed:', err);
            toastError(err.message || 'Failed to delete submission');
        } finally {
            setDeleteLoading(false);
        }
    };

    // Generate columns from form fields
    const columns = () => {
        if (!form || !form.fields) return [];

        return [
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
                    if (field.fieldType === 'boolean') return value ? '✓ Yes' : '✗ No';
                    // Linear scale — show as a star/number badge
                    if (field.fieldType === 'linear_scale' && value !== null && value !== undefined) {
                        return (
                            <span style={{
                                padding: '3px 10px', borderRadius: '12px', fontSize: '13px',
                                background: 'rgba(245,158,11,0.15)', color: '#FCD34D',
                                border: '1px solid rgba(245,158,11,0.3)', fontWeight: 600
                            }}>⭐ {value}</span>
                        );
                    }
                    // Star Rating — show as colored stars
                    if (field.fieldType === 'star_rating' && value !== null && value !== undefined) {
                        const num = Number(value);
                        return (
                            <span style={{ color: '#F59E0B', fontSize: 18, letterSpacing: 2 }}>
                                {'★'.repeat(num)}{'☆'.repeat(5 - num)}
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>({num}/5)</span>
                            </span>
                        );
                    }
                    // Multiple choice grid — compact row→col summary
                    if (field.fieldType === 'multiple_choice_grid' && value) {
                        let obj = {};
                        try { obj = JSON.parse(String(value)); } catch {}
                        const entries = Object.entries(obj);
                        if (entries.length === 0) return '—';
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {entries.slice(0, 2).map(([row, col], idx) => (
                                    <span key={idx} style={{ fontSize: '12px' }}>
                                        <b style={{ color: 'var(--text-primary)' }}>{row}:</b>{' '}
                                        <span style={{ color: 'var(--text-secondary)' }}>{col}</span>
                                    </span>
                                ))}
                                {entries.length > 2 && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>+{entries.length - 2} more…</span>}
                            </div>
                        );
                    }
                    // Checkbox grid — compact multi-select summary
                    if (field.fieldType === 'checkbox_grid' && value) {
                        let obj = {};
                        try { obj = JSON.parse(String(value)); } catch {}
                        const entries = Object.entries(obj).filter(([, v]) => Array.isArray(v) ? v.length > 0 : !!v);
                        if (entries.length === 0) return '—';
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {entries.slice(0, 2).map(([row, cols], idx) => (
                                    <span key={idx} style={{ fontSize: '12px' }}>
                                        <b style={{ color: 'var(--text-primary)' }}>{row}:</b>{' '}
                                        <span style={{ color: 'var(--text-secondary)' }}>{Array.isArray(cols) ? cols.join(', ') : cols}</span>
                                    </span>
                                ))}
                                {entries.length > 2 && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>+{entries.length - 2} more…</span>}
                            </div>
                        );
                    }
                    // Multiple choice — parse JSON array and show as comma-separated tags
                    if (field.fieldType === 'multiple_choice' && value) {
                        let items = [];
                        const str = String(value).trim();
                        if (str.startsWith('[')) {
                            try { items = JSON.parse(str); } catch { items = [str]; }
                        } else {
                            items = str.split(',').map(v => v.trim()).filter(Boolean);
                        }
                        return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {items.map((item, idx) => (
                                    <span key={idx} style={{
                                        padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
                                        background: 'rgba(20,184,166,0.15)', color: '#5EEAD4',
                                        border: '1px solid rgba(20,184,166,0.3)', whiteSpace: 'nowrap'
                                    }}>{item}</span>
                                ))}
                            </div>
                        );
                    }
                    if (field.fieldType === 'file' && value) {
                        // Support multiple files stored as comma-separated filenames
                        const filenames = String(value).split(',').map(f => f.trim()).filter(Boolean);
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {filenames.map((filename, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleFileDownload(filename)}
                                        className="btn-file-download"
                                        title={`Download: ${filename}`}
                                    >
                                        📎 {filename.length > 28 ? filename.substring(0, 28) + '...' : filename}
                                    </button>
                                ))}
                            </div>
                        );
                    }
                    if (field.fieldType === 'date' && value) {
                        return new Date(value).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                        });
                    }
                    const strValue = String(value);
                    return strValue.length > 50 ? strValue.substring(0, 50) + '...' : strValue;
                }
            })),
            {
                key: 'created_at',
                label: 'Submitted At',
                sortable: true,
                render: (value) => value ? new Date(value).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : '—'
            },
            {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (_, row) => (
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedSubmission(row)}
                            title="View details"
                        >
                            👁 View
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEdit(row)}
                            title="Edit submission"
                            style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
                        >
                            ✏️ Edit
                        </button>
                        <button
                            className="btn btn-sm"
                            onClick={() => setDeletingSubmission(row)}
                            title="Delete submission"
                            style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                        >
                            🗑 Delete
                        </button>
                    </div>
                )
            }
        ];
    };

    const formatDate = (dt) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    };

    // Render an edit field based on field type
    const renderEditField = (field) => {
        const val = editFormData[field.fieldKey] ?? '';
        if (field.fieldType === 'file') return null;

        if (field.fieldType === 'boolean') {
            return (
                <select
                    className="form-select"
                    value={val}
                    onChange={(e) => handleEditChange(field.fieldKey, e.target.value)}
                >
                    <option value="">— Select —</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            );
        }

        if (field.fieldType === 'date') {
            return (
                <input
                    type="date"
                    className="form-input"
                    value={val}
                    onChange={(e) => handleEditChange(field.fieldKey, e.target.value)}
                />
            );
        }

        if (field.fieldType === 'number') {
            return (
                <input
                    type="number"
                    className="form-input"
                    value={val}
                    onChange={(e) => handleEditChange(field.fieldKey, e.target.value)}
                />
            );
        }

        // Linear Scale — show scale buttons
        if (field.fieldType === 'linear_scale') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            let uiCfg = {};
            if (renderField?.uiConfigJson) {
                try { uiCfg = JSON.parse(renderField.uiConfigJson); } catch {}
            }
            const scaleMin = uiCfg.scaleMin ?? 1;
            const scaleMax = uiCfg.scaleMax ?? 5;
            const steps = [];
            for (let i = scaleMin; i <= scaleMax; i++) steps.push(i);
            const selected = val !== '' && val !== null && val !== undefined ? Number(val) : null;
            return (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                    {steps.map((step) => {
                        const isActive = selected === step;
                        return (
                            <button
                                key={step}
                                type="button"
                                onClick={() => handleEditChange(field.fieldKey, step)}
                                style={{
                                    width: 40, height: 40, borderRadius: '50%',
                                    border: isActive ? '2px solid var(--accent)' : '2px solid rgba(139,92,246,0.3)',
                                    background: isActive ? 'linear-gradient(135deg,#7C3AED,#EC4899)' : 'rgba(255,255,255,0.04)',
                                    color: isActive ? '#fff' : 'var(--text-secondary)',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.18s ease',
                                    boxShadow: isActive ? '0 0 14px rgba(139,92,246,0.4)' : 'none',
                                }}
                            >
                                {step}
                            </button>
                        );
                    })}
                </div>
            );
        }

        // Dropdown — single <select>
        if (field.fieldType === 'dropdown') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            const opts = Array.isArray(renderField?.options) ? renderField.options : [];
            return (
                <select
                    className="form-select"
                    value={val}
                    onChange={(e) => handleEditChange(field.fieldKey, e.target.value)}
                >
                    <option value="">— Select —</option>
                    {opts.map((opt, idx) => {
                        const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value || '');
                        const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || '');
                        return (
                            <option key={idx} value={optValue}>{optLabel}</option>
                        );
                    })}
                </select>
            );
        }

        // Radio — single-select radio buttons
        if (field.fieldType === 'radio') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            const opts = Array.isArray(renderField?.options) ? renderField.options : [];
            return (
                <div className="radio-group">
                    {opts.map((opt, idx) => {
                        const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value || opt);
                        const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || opt);
                        return (
                            <label key={idx} className="radio-option">
                                <input
                                    type="radio"
                                    name={field.fieldKey}
                                    value={optValue}
                                    checked={val === optValue}
                                    onChange={(e) => handleEditChange(field.fieldKey, e.target.value)}
                                />
                                <span>{optLabel}</span>
                            </label>
                        );
                    })}
                </div>
            );
        }

        // Multiple Choice — multi-select checkboxes (stored as JSON array)
        if (field.fieldType === 'multiple_choice') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            const opts = Array.isArray(renderField?.options) ? renderField.options : [];
            // Parse current value — support JSON array or legacy comma string
            let selected = [];
            if (val) {
                const str = String(val).trim();
                if (str.startsWith('[')) {
                    try { selected = JSON.parse(str); } catch { selected = []; }
                } else {
                    selected = str.split(',').map(v => v.trim()).filter(Boolean);
                }
            }
            return (
                <div className="radio-group">
                    {opts.map((opt, idx) => {
                        const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value || '');
                        const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || '');
                        const isChecked = selected.includes(optValue);
                        const handleChange = (e) => {
                            e.stopPropagation();
                            // Read fresh value from editFormData to avoid stale closure
                            const currentVal = editFormData[field.fieldKey] || '';
                            let currentSelected = [];
                            if (currentVal) {
                                const str = String(currentVal).trim();
                                if (str.startsWith('[')) {
                                    try { currentSelected = JSON.parse(str); } catch { currentSelected = []; }
                                } else {
                                    currentSelected = str.split(',').map(v => v.trim()).filter(Boolean);
                                }
                            }
                            const checked = e.target.checked;
                            const next = checked
                                ? [...currentSelected, optValue]
                                : currentSelected.filter(v => v !== optValue);
                            const unique = [...new Set(next)];
                            handleEditChange(field.fieldKey, JSON.stringify(unique));
                        };
                        return (
                            <label key={idx} className="radio-option checkbox-style">
                                <input
                                    type="checkbox"
                                    value={optValue}
                                    checked={isChecked}
                                    onChange={handleChange}
                                />
                                <span>{optLabel}</span>
                            </label>
                        );
                    })}
                </div>
            );
        }
        // Multiple Choice Grid — radio per row
        if (field.fieldType === 'multiple_choice_grid') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            let rows = [], cols = [];
            if (renderField?.gridJson) {
                try { const g = JSON.parse(renderField.gridJson); rows = g.rows || []; cols = g.columns || []; } catch {}
            }
            let selected = {};
            if (val) { try { selected = JSON.parse(val); } catch {} }
            const handleGridChange = (row, col) => {
                handleEditChange(field.fieldKey, JSON.stringify({ ...selected, [row]: col }));
            };
            return (
                <div style={{ overflowX: 'auto' }}>
                    <table className="mcg-table" style={{ fontSize: 13 }}>
                        <thead>
                            <tr className="mcg-header-row">
                                <th></th>
                                {cols.map((col, ci) => <th key={ci}>{col}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={ri} className="mcg-row">
                                    <td className="mcg-row-label">{row}</td>
                                    {cols.map((col, ci) => (
                                        <td key={ci} className="mcg-cell">
                                            <label className="mcg-radio-wrap">
                                                <input
                                                    type="radio"
                                                    name={`edit-${field.fieldKey}-row-${ri}`}
                                                    value={col}
                                                    checked={selected[row] === col}
                                                    onChange={() => handleGridChange(row, col)}
                                                />
                                                <span className="mcg-radio-circle">
                                                    <span className="mcg-radio-dot" />
                                                </span>
                                            </label>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        // Star Rating — 5 star buttons
        if (field.fieldType === 'star_rating') {
            const selected = val !== '' && val !== null && val !== undefined ? Number(val) : null;
            return (
                <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                    {[1, 2, 3, 4, 5].map((star) => {
                        const isActive = selected === star;
                        return (
                            <button
                                key={star}
                                type="button"
                                onClick={() => handleEditChange(field.fieldKey, star)}
                                style={{
                                    fontSize: 28, cursor: 'pointer', background: 'none', border: 'none',
                                    color: isActive ? '#F59E0B' : 'rgba(245,158,11,0.3)',
                                    transition: 'color 0.15s ease, transform 0.15s ease',
                                    transform: isActive ? 'scale(1.2)' : 'scale(1)',
                                    padding: '0 2px',
                                }}
                            >
                                {isActive ? '★' : '☆'}
                            </button>
                        );
                    })}
                </div>
            );
        }

        // Checkbox Grid — checkbox per row (multi-select per row)
        if (field.fieldType === 'checkbox_grid') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            let rows = [], cols = [];
            if (renderField?.gridJson) {
                try { const g = JSON.parse(renderField.gridJson); rows = g.rows || []; cols = g.columns || []; } catch {}
            }
            let selected = {};
            if (val) { try { selected = JSON.parse(val); } catch {} }
            const handleCbGridChange = (row, col, checked) => {
                const current = Array.isArray(selected[row]) ? selected[row] : (selected[row] ? [selected[row]] : []);
                const next = checked ? [...new Set([...current, col])] : current.filter(v => v !== col);
                handleEditChange(field.fieldKey, JSON.stringify({ ...selected, [row]: next }));
            };
            return (
                <div style={{ overflowX: 'auto' }}>
                    <table className="mcg-table" style={{ fontSize: 13 }}>
                        <thead>
                            <tr className="mcg-header-row">
                                <th></th>
                                {cols.map((col, ci) => <th key={ci}>{col}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={ri} className="mcg-row">
                                    <td className="mcg-row-label">{row}</td>
                                    {cols.map((col, ci) => {
                                        const rowSel = Array.isArray(selected[row]) ? selected[row] : (selected[row] ? [selected[row]] : []);
                                        return (
                                            <td key={ci} className="mcg-cell">
                                                <label className="mcg-checkbox-wrap">
                                                    <input
                                                        type="checkbox"
                                                        value={col}
                                                        checked={rowSel.includes(col)}
                                                        onChange={(e) => handleCbGridChange(row, col, e.target.checked)}
                                                    />
                                                    <span className="mcg-checkbox-box">
                                                        <span className="mcg-checkbox-tick">✓</span>
                                                    </span>
                                                </label>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        return (
            <input
                type="text"
                className="form-input"
                value={val}
                onChange={(e) => handleEditChange(field.fieldKey, e.target.value)}
            />
        );
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

            {/* ── View Submission Modal ── */}
            {selectedSubmission && (
                <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
                    <div className="modal-box sub-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">📋 Submission Details</span>
                            <button className="modal-close" onClick={() => setSelectedSubmission(null)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Submission ID</label>
                                <div className="sub-readonly-field sub-mono">{selectedSubmission.id}</div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Submitted At</label>
                                <div className="sub-readonly-field">
                                    {selectedSubmission.created_at ? new Date(selectedSubmission.created_at).toLocaleString('en-IN') : '—'}
                                </div>
                            </div>
                            <div className="sub-divider" />
                            {form?.fields?.map((field) => (
                                <div key={field.fieldKey} className="form-group">
                                    <label className="form-label">
                                        {field.label}
                                        {field.required && <span className="form-field-required-star"> *</span>}
                                    </label>
                                    <div className={`sub-readonly-field${field.fieldType === 'file' ? ' sub-file-field' : ''}`}>
                                        {(() => {
                                            const value = selectedSubmission[field.fieldKey];
                                            if (value === null || value === undefined || value === '') {
                                                return <span className="sub-empty">No value provided</span>;
                                            }
                                            if (field.fieldType === 'boolean') return value ? '✓ Yes' : '✗ No';
                                            // Linear scale — show as badge
                                            if (field.fieldType === 'linear_scale') {
                                                return (
                                                    <span style={{
                                                        padding: '4px 14px', borderRadius: '12px', fontSize: '16px',
                                                        background: 'rgba(245,158,11,0.15)', color: '#FCD34D',
                                                        border: '1px solid rgba(245,158,11,0.3)', fontWeight: 700,
                                                        display: 'inline-block'
                                                    }}>⭐ {value}</span>
                                                );
                                            }
                                            // Star Rating — show colored stars
                                            if (field.fieldType === 'star_rating') {
                                                const num = Number(value);
                                                return (
                                                    <span style={{ color: '#F59E0B', fontSize: 24, letterSpacing: 3 }}>
                                                        {'★'.repeat(Math.max(0, Math.min(5, num)))}
                                                        {'☆'.repeat(Math.max(0, 5 - Math.min(5, num)))}
                                                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', marginLeft: 8 }}>({num}/5)</span>
                                                    </span>
                                                );
                                            }
                                            // Multiple choice grid — show row→col table
                                            if (field.fieldType === 'multiple_choice_grid') {
                                                let obj = {};
                                                try { obj = JSON.parse(String(value)); } catch {}
                                                const entries = Object.entries(obj);
                                                if (entries.length === 0) return <span className="sub-empty">No value provided</span>;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {entries.map(([row, col], idx) => (
                                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{
                                                                    padding: '2px 10px', borderRadius: '8px', fontSize: '12px',
                                                                    background: 'rgba(99,102,241,0.12)', color: 'var(--text-secondary)',
                                                                    minWidth: 80, textAlign: 'right', whiteSpace: 'nowrap'
                                                                }}>{row}</span>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>→</span>
                                                                <span style={{
                                                                    padding: '2px 10px', borderRadius: '8px', fontSize: '12px',
                                                                    background: 'rgba(16,185,129,0.15)', color: '#6EE7B7',
                                                                    border: '1px solid rgba(16,185,129,0.25)'
                                                                }}>{col}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            // Checkbox grid — show row→[cols] table
                                            if (field.fieldType === 'checkbox_grid') {
                                                let obj = {};
                                                try { obj = JSON.parse(String(value)); } catch {}
                                                const entries = Object.entries(obj).filter(([, v]) => Array.isArray(v) ? v.length > 0 : !!v);
                                                if (entries.length === 0) return <span className="sub-empty">No value provided</span>;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {entries.map(([row, cols], idx) => (
                                                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                                                <span style={{
                                                                    padding: '2px 10px', borderRadius: '8px', fontSize: '12px',
                                                                    background: 'rgba(99,102,241,0.12)', color: 'var(--text-secondary)',
                                                                    minWidth: 80, textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center'
                                                                }}>{row}</span>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: 12, alignSelf: 'center' }}>→</span>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                    {(Array.isArray(cols) ? cols : [cols]).map((c, ci) => (
                                                                        <span key={ci} style={{
                                                                            padding: '2px 10px', borderRadius: '8px', fontSize: '12px',
                                                                            background: 'rgba(16,185,129,0.15)', color: '#6EE7B7',
                                                                            border: '1px solid rgba(16,185,129,0.25)'
                                                                        }}>{c}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            // Multiple choice — parse JSON array and show as tags
                                            if (field.fieldType === 'multiple_choice') {
                                                let items = [];
                                                const str = String(value).trim();
                                                if (str.startsWith('[')) {
                                                    try { items = JSON.parse(str); } catch { items = [str]; }
                                                } else {
                                                    items = str.split(',').map(v => v.trim()).filter(Boolean);
                                                }
                                                return (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {items.map((item, idx) => (
                                                            <span key={idx} style={{
                                                                padding: '4px 12px', borderRadius: '12px', fontSize: '13px',
                                                                background: 'rgba(20,184,166,0.15)', color: '#5EEAD4',
                                                                border: '1px solid rgba(20,184,166,0.3)'
                                                            }}>{item}</span>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            if (field.fieldType === 'file') {
                                                const filenames = String(value).split(',').map(f => f.trim()).filter(Boolean);
                                                return (
                                                    <div className="sub-file-list">
                                                        {filenames.map((filename, idx) => (
                                                            <div key={idx} className="sub-file-row">
                                                                <button
                                                                    onClick={() => handleFileDownload(filename)}
                                                                    className="btn btn-secondary btn-sm"
                                                                >
                                                                    💾 Download
                                                                </button>
                                                                <span className="sub-filename">
                                                                    📎 {filename.length > 40 ? filename.substring(0, 40) + '...' : filename}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            if (field.fieldType === 'date') return new Date(value).toLocaleDateString('en-IN');
                                            return value;
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSelectedSubmission(null)}>Close</button>
                            <button
                                className="btn btn-primary"
                                onClick={() => { setSelectedSubmission(null); openEdit(selectedSubmission); }}
                            >
                                ✏️ Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Submission Modal ── */}
            {editingSubmission && (
                <div className="modal-overlay" onClick={() => !editLoading && setEditingSubmission(null)}>
                    <div className="modal-box sub-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">✏️ Edit Submission</span>
                            <button className="modal-close" onClick={() => setEditingSubmission(null)} disabled={editLoading}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Submission ID</label>
                                <div className="sub-readonly-field sub-mono">{editingSubmission.id}</div>
                            </div>
                            <div className="sub-divider" />
                            {form?.fields?.filter(f => f.fieldType !== 'file').map((field) => (
                                <div key={field.fieldKey} className="form-group">
                                    <label className="form-label">
                                        {field.label}
                                        {field.required && <span className="form-field-required-star"> *</span>}
                                    </label>
                                    {renderEditField(field)}
                                </div>
                            ))}
                            {form?.fields?.some(f => f.fieldType === 'file') && (
                                <p className="sub-file-note">
                                    ⚠️ File fields cannot be edited. Re-submit the form to update files.
                                </p>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setEditingSubmission(null)} disabled={editLoading}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleEditSubmit} disabled={editLoading}>
                                {editLoading ? <><span className="spinner" style={{width:16,height:16}} /> Saving…</> : '💾 Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirmation Modal ── */}
            {deletingSubmission && (
                <div className="modal-overlay" onClick={() => !deleteLoading && setDeletingSubmission(null)}>
                    <div className="modal-box sub-modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">🗑 Delete Submission</span>
                            <button className="modal-close" onClick={() => setDeletingSubmission(null)} disabled={deleteLoading}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="sub-delete-msg">
                                Are you sure you want to delete this submission? This action cannot be undone.
                            </p>
                            <div className="sub-delete-id">
                                ID: {deletingSubmission.id}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeletingSubmission(null)} disabled={deleteLoading}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
                                {deleteLoading ? <><span className="spinner" style={{width:16,height:16}} /> Deleting…</> : '🗑 Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

