import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import DataTable from '../../components/DataTable';
import { getForm, getSubmissions, downloadFile, deleteSubmission, updateSubmission, getFormRender } from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

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
    const { can } = useAuth();

    const [form, setForm] = useState(null);
    const [renderData, setRenderData] = useState(null); // Stores /render response with resolved options
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

    // Search, Sort, Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 6;

    // Edit state
    const [editingSubmission, setEditingSubmission] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [editLoading, setEditLoading] = useState(false);

    // Delete state
    const [deletingSubmission, setDeletingSubmission] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Multi-select state
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

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
                    const raw = submission[field.fieldKey];
                    if (raw === null || raw === undefined) {
                        initialData[field.fieldKey] = '';
                    } else {
                        const str = String(raw);
                        // For dropdown single-select stored as JSON string ("\"Option\""), unwrap it
                        if (field.fieldType === 'dropdown') {
                            const trimmed = str.trim();
                            if (trimmed.startsWith('[')) {
                                // Multi-select: keep as JSON string so checkboxes can parse it
                                initialData[field.fieldKey] = trimmed;
                            } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
                                // Single-select stored as JSON quoted string → unwrap
                                try { initialData[field.fieldKey] = JSON.parse(trimmed); }
                                catch { initialData[field.fieldKey] = trimmed; }
                            } else {
                                initialData[field.fieldKey] = trimmed;
                            }
                        } else {
                            initialData[field.fieldKey] = str;
                        }
                    }
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

    /** Filter out system fields like status and user_id from editing */
    const editableFields = useMemo(() => {
        if (!form?.fields) return [];
        return form.fields.filter(f => !['field_group', 'section_header', 'label_text', 'description_block', 'page_break'].includes(f.fieldType));
    }, [form?.fields]);

    // Confirm delete
    const handleDeleteConfirm = async () => {
        if (!deletingSubmission) return;
        setDeleteLoading(true);
        try {
            await deleteSubmission(id, deletingSubmission.id);
            toastSuccess('Submission deleted successfully');
            setDeletingSubmission(null);
            setSubmissions((prev) => prev.filter((s) => s.id !== deletingSubmission.id));
            setSelectedIds((prev) => {
                const n = new Set(prev);
                n.delete(deletingSubmission.id);
                return n;
            });
        } catch (err) {
            console.error('Delete failed:', err);
            toastError(err.message || 'Failed to delete submission');
        } finally {
            setDeleteLoading(false);
        }
    };

    // ── Bulk delete ──────────────────────────────────────────
    const handleToggleSelection = (ids, isSelected) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            ids.forEach(id => {
                if (isSelected) next.add(id);
                else next.delete(id);
            });
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setBulkDeleting(true);
        let deleted = 0;
        const idsToDelete = [...selectedIds];

        try {
            // Delete sequentially to avoid overwhelming the server, or use Promise.all if supported
            for (const subId of idsToDelete) {
                await deleteSubmission(id, subId);
                deleted++;
            }
            toastSuccess(`${deleted} submissions deleted successfully`);
            setSubmissions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
            setSelectedIds(new Set());
            setShowBulkConfirm(false);
        } catch (err) {
            console.error('Bulk delete failed:', err);
            toastError('Failed to delete some submissions. Please refresh.');
        } finally {
            setBulkDeleting(false);
        }
    };

    // ── Export helpers ─────────────────────────────────────────────────────────

    /** Format a raw cell value to a plain string for CSV / PDF */
    const formatCellValue = (field, rawValue) => {
        if (rawValue === null || rawValue === undefined || rawValue === '') return '';
        const v = rawValue;
        if (field.fieldType === 'boolean') return v === true || v === 'true' ? 'Yes' : 'No';
        if (field.fieldType === 'date') {
            const d = new Date(v);
            return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (field.fieldType === 'star_rating') {
            const n = Number(v);
            return `${n}/5 ${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
        }
        if (field.fieldType === 'linear_scale') return String(v);
        if (field.fieldType === 'multiple_choice' || field.fieldType === 'dropdown') {
            const str = String(v).trim();
            if (str.startsWith('[')) {
                try { return JSON.parse(str).join(', '); } catch { }
            }
            // For single-select dropdown stored as JSON string "\"Option\"", remove the quotes for export
            if (str.startsWith('"') && str.endsWith('"')) {
                try { return JSON.parse(str); } catch { }
            }
            return str;
        }
        if (field.fieldType === 'multiple_choice_grid' || field.fieldType === 'checkbox_grid') {
            try {
                const obj = JSON.parse(String(v));
                return Object.entries(obj)
                    .map(([row, col]) => `${row}: ${Array.isArray(col) ? col.join(', ') : col}`)
                    .join(' | ');
            } catch { return String(v); }
        }
        if (field.fieldType === 'file') {
            return String(v).split(',').map(f => f.trim()).join(', ');
        }
        return String(v);
    };

    // ── Export helpers ─────────────────────────────────────────────────────────

    /** Safe file name with date stamp */
    const safeFileName = (ext) =>
        `${(form?.name || 'submissions').replace(/[^a-z0-9]/gi, '_')}_submissions_${new Date().toISOString().slice(0, 10)}${ext}`;

    /** Build flat headers + rows array shared by all export formats */
    const buildExportRows = () => {
        const dynFields = (form?.fields || []).filter(
            f => !['section_header', 'label_text', 'description_block', 'page_break'].includes(f.fieldType)
        );
        const showTs = form?.showTimestamp ?? true;
        const headers = ['#', 'Submission ID', 'Status', ...dynFields.map(f => f.label || f.fieldKey), ...(showTs ? ['Submitted At'] : [])];
        const rows = submissions.map((sub, i) => [
            i + 1,
            sub.id || '',
            sub.status || 'SUBMITTED',
            ...dynFields.map(f => formatCellValue(f, sub[f.fieldKey])),
            ...(showTs ? [sub.created_at ? new Date(sub.created_at).toLocaleString('en-IN') : ''] : []),
        ]);
        return { headers, rows };
    };

    /** Export CSV */
    const exportCSV = () => {
        if (!form?.fields || submissions.length === 0) return;
        const { headers, rows } = buildExportRows();
        const csv = [
            headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
            ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
        ].join('\r\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFileName('.csv');
        a.click();
        URL.revokeObjectURL(url);
        toastSuccess('CSV exported! 📊');
    };

    /** Export XLSX (Excel) */
    const exportXLSX = async () => {
        if (!form?.fields || submissions.length === 0) return;
        try {
            const XLSX = await import('xlsx');
            const { headers, rows } = buildExportRows();

            // Submissions sheet
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            // Auto column widths
            ws['!cols'] = headers.map((h, ci) => ({
                wch: Math.min(60, Math.max(12,
                    Math.max(String(h).length, ...rows.map(r => String(r[ci] ?? '').length)) + 2
                ))
            }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Submissions');

            // Info / metadata sheet
            const meta = XLSX.utils.aoa_to_sheet([
                ['Form Name', form.name || ''],
                ['Description', form.description || '—'],
                ['Total Submissions', submissions.length],
                ['Exported At', new Date().toLocaleString('en-IN')],
                ['Exported By', 'FormCraft'],
            ]);
            meta['!cols'] = [{ wch: 22 }, { wch: 55 }];
            XLSX.utils.book_append_sheet(wb, meta, 'Info');

            XLSX.writeFile(wb, safeFileName('.xlsx'));
            toastSuccess('Excel file exported! 📗');
        } catch (err) {
            console.error('XLSX export error:', err);
            toastError('XLSX export failed. Please run: npm install xlsx');
        }
    };

    /** Export PDF */
    const exportPDF = async () => {
        if (!form?.fields || submissions.length === 0) return;
        try {
            const { jsPDF } = await import('jspdf');
            const autoTable = (await import('jspdf-autotable')).default;
            const { headers, rows } = buildExportRows();

            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();

            // ── Purple header bar ──────────────────────────────────────────
            doc.setFillColor(99, 60, 200);
            doc.rect(0, 0, pageW, 58, 'F');

            // Title
            doc.setFontSize(20);
            doc.setTextColor(255, 255, 255);
            doc.setFont(undefined, 'bold');
            doc.text(form.name || 'Form Submissions', 36, 36);

            // Subtitle
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(210, 200, 240);
            doc.text(
                `${submissions.length} response${submissions.length !== 1 ? 's' : ''}  ·  Exported ${new Date().toLocaleString('en-IN')}`,
                36, 50
            );

            let startY = 74;
            if (form.description) {
                doc.setFontSize(9);
                doc.setTextColor(80, 60, 120);
                doc.text(form.description, 36, startY);
                startY += 18;
            }

            // ── Data table ────────────────────────────────────────────────
            autoTable(doc, {
                head: [headers],
                body: rows.map(r => r.map(c => String(c ?? ''))),
                startY,
                margin: { left: 36, right: 36 },
                tableWidth: 'auto',
                styles: {
                    fontSize: 8,
                    cellPadding: 5,
                    overflow: 'linebreak',
                    textColor: [30, 20, 50],
                    lineColor: [210, 200, 240],
                    lineWidth: 0.3,
                },
                headStyles: {
                    fillColor: [99, 60, 200],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8.5,
                    cellPadding: { top: 7, bottom: 7, left: 5, right: 5 },
                },
                alternateRowStyles: { fillColor: [248, 245, 255] },
                rowPageBreak: 'auto',
                showHead: 'everyPage',
                didDrawPage: (d) => {
                    const totalPages = doc.internal.getNumberOfPages();
                    doc.setFontSize(7.5);
                    doc.setTextColor(160, 140, 190);
                    doc.setFont(undefined, 'normal');
                    doc.text('FormCraft — Submission Export', 36, pageH - 14);
                    doc.text(
                        `Page ${d.pageNumber} of ${totalPages}`,
                        pageW / 2, pageH - 14,
                        { align: 'center' }
                    );
                    doc.text(form.name || '', pageW - 36, pageH - 14, { align: 'right' });
                },
            });

            doc.save(safeFileName('.pdf'));
            toastSuccess('PDF exported! 📄');
        } catch (err) {
            console.error('PDF export error:', err);
            toastError('PDF export failed. Please run: npm install jspdf jspdf-autotable');
        }
    };

    // ── Filtering & Sorting Logic ──────────────────────────────────────────────

    const filteredAndSortedSubmissions = useMemo(() => {
        let result = [...submissions];

        // 1. Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(sub => {
                return Object.values(sub).some(val =>
                    val && String(val).toLowerCase().includes(q)
                );
            });
        }

        // 2. Date range filter
        if (dateRange.start || dateRange.end) {
            result = result.filter(sub => {
                if (!sub.created_at) return false;
                const subDate = new Date(sub.created_at);
                if (dateRange.start && subDate < new Date(dateRange.start)) return false;
                if (dateRange.end) {
                    const end = new Date(dateRange.end);
                    end.setHours(23, 59, 59, 999);
                    if (subDate > end) return false;
                }
                return true;
            });
        }

        // 3. Sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [submissions, searchQuery, sortConfig, dateRange]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, dateRange, sortConfig]);

    // Handle sort toggle
    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Generate columns from form fields
    const columns = () => {
        if (!form || !form.fields) return [];

        // Create a map of group keys to labels
        const groupLabels = {};
        form.fields.forEach(f => {
            if (f.fieldType === 'field_group') {
                groupLabels[f.fieldKey] = f.label;
            }
        });

        return [
            {
                key: 'id',
                label: 'ID',
                sortable: true,
                render: (value) => value ? String(value).substring(0, 8) + '...' : '—'
            },
            ...form.fields
                .filter(field => !['field_group', 'section_header', 'label_text', 'description_block', 'page_break'].includes(field.fieldType))
                .map(field => {
                    const groupLabel = field.parentGroupKey ? groupLabels[field.parentGroupKey] : null;
                    const fullLabel = groupLabel ? `${groupLabel} > ${field.label}` : field.label;

                    return {
                        key: field.fieldKey,
                        label: fullLabel,
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
                                try { obj = JSON.parse(String(value)); } catch { }
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
                                try { obj = JSON.parse(String(value)); } catch { }
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
                            // Multiple choice & Multi-select Dropdown — parse JSON array and show as comma-separated tags
                            if ((field.fieldType === 'multiple_choice' || field.fieldType === 'dropdown') && value) {
                                let items = [];
                                const str = String(value).trim();
                                if (str.startsWith('[')) {
                                    try { items = JSON.parse(str); } catch { items = [str]; }
                                } else if (str.startsWith('"') && str.endsWith('"')) {
                                    // Single-select dropdown stored as JSON string ("\"Option\"") -> strip quotes
                                    try { items = [JSON.parse(str)]; } catch { items = [str]; }
                                } else {
                                    items = str.split(',').map(v => v.trim()).filter(Boolean);
                                }

                                // For standard single-select fallback (or when only 1 item from non-array string)
                                if (items.length === 1 && field.fieldType === 'dropdown' && !str.startsWith('[')) {
                                    const strValue = String(items[0]);
                                    return strValue.length > 50 ? strValue.substring(0, 50) + '...' : strValue;
                                }

                                return (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {items.map((item, idx) => (
                                            <span key={idx} style={{
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
                                                background: field.fieldType === 'dropdown' ? 'rgba(99,102,241,0.15)' : 'rgba(20,184,166,0.15)',
                                                color: field.fieldType === 'dropdown' ? '#a5b4fc' : '#5EEAD4',
                                                border: field.fieldType === 'dropdown' ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(20,184,166,0.3)',
                                                whiteSpace: 'nowrap'
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
                    };
                }),
            // Only show timestamp column when form has showTimestamp enabled
            ...(form?.showTimestamp ? [{
                key: 'created_at',
                label: 'Submitted At',
                sortable: true,
                render: (value) => value ? new Date(value).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : '—'
            }] : []),
            {
                key: 'status',
                label: 'Status',
                sortable: true,
                render: (value) => {
                    const isDraft = value === 'DRAFTED';
                    return (
                        <span className={`badge ${isDraft ? 'badge-warning' : 'badge-number'}`} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap',
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '4px 12px',
                            borderRadius: '99px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            background: isDraft ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isDraft ? '#FCD34D' : '#34D399',
                            border: `1px solid ${isDraft ? 'rgba(245, 158, 11, 0.22)' : 'rgba(16, 185, 129, 0.22)'}`
                        }}>
                            <span>{isDraft ? '📝' : '✅'}</span>
                            <span>{isDraft ? 'Draft' : 'Submitted'}</span>
                        </span>
                    );
                }
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
                        {can('EDIT') && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEdit(row)}
                                title="Edit submission"
                                style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
                            >
                                ✏️ Edit
                            </button>
                        )}
                        {can('DELETE') && (
                            <button
                                className="btn btn-sm"
                                onClick={() => setDeletingSubmission(row)}
                                title="Delete submission"
                                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                            >
                                🗑 Delete
                            </button>
                        )}
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

    // ── Grid Selection Helpers ──────────────────────────────────────────
    const currentGridSubmissions = useMemo(() => {
        return filteredAndSortedSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [filteredAndSortedSubmissions, currentPage, pageSize]);

    const isAllGridSelected = currentGridSubmissions.length > 0 &&
        currentGridSubmissions.every(s => selectedIds.has(s.id));

    const handleToggleSelectAllGrid = () => {
        const ids = currentGridSubmissions.map(s => s.id);
        handleToggleSelection(ids, !isAllGridSelected);
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
                try { uiCfg = JSON.parse(renderField.uiConfigJson); } catch { }
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

        // Dropdown — single <select> or multi-select custom UI
        if (field.fieldType === 'dropdown') {
            const renderField = renderData?.fields?.find(f => f.fieldKey === field.fieldKey);
            const opts = Array.isArray(renderField?.options) ? renderField.options : [];
            let isMulti = false;
            try {
                const uiCfg = JSON.parse(renderField?.uiConfigJson || '{}');
                isMulti = !!uiCfg.multiple;
            } catch { }

            if (!isMulti) {
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

            // Multi Select — render as checkboxes similar to multiple_choice
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
                <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {opts.map((opt, idx) => {
                        const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value || '');
                        const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || '');
                        const isChecked = selected.includes(optValue);
                        const handleChange = (e) => {
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
                try { const g = JSON.parse(renderField.gridJson); rows = g.rows || []; cols = g.columns || []; } catch { }
            }
            let selected = {};
            if (val) { try { selected = JSON.parse(val); } catch { } }
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
                try { const g = JSON.parse(renderField.gridJson); rows = g.rows || []; cols = g.columns || []; } catch { }
            }
            let selected = {};
            if (val) { try { selected = JSON.parse(val); } catch { } }
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
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <Link href={`/submit/${id}`} className="btn btn-secondary" target="_blank">
                                📝 Submit Form
                            </Link>
                            <Link href={`/preview/${id}`} className="btn btn-secondary">
                                👁 Preview Form
                            </Link>
                            {can('DELETE') && (
                                <Link href={`/submissions/trash/${id}`} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    🗑 Trash
                                </Link>
                            )}
                            {/* Export buttons — only shown when there are submissions and user has EXPORT perm */}
                            {submissions.length > 0 && can('EXPORT') && (
                                <div className="export-btn-group">
                                    <button
                                        className="btn btn-export-csv"
                                        onClick={exportCSV}
                                        title="Download as CSV (Excel compatible)"
                                    >
                                        📊 CSV
                                    </button>
                                    <button
                                        className="btn btn-export-xlsx"
                                        onClick={exportXLSX}
                                        title="Download as Excel (.xlsx)"
                                    >
                                        📗 XLSX
                                    </button>
                                    <button
                                        className="btn btn-export-pdf"
                                        onClick={exportPDF}
                                        title="Download as PDF"
                                    >
                                        📄 PDF
                                    </button>
                                </div>
                            )}
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

                    {/* View mode toggle & Search/Filter Bar */}
                    {!loading && form && submissions.length > 0 && (
                        <div className="submissions-controls-container">
                            <div className="view-toggle-bar">
                                <span className="view-toggle-label">View:</span>
                                <div className="view-toggle-group">
                                    <button
                                        className={`view-toggle-btn${viewMode === 'table' ? ' active' : ''}`}
                                        onClick={() => setViewMode('table')}
                                        title="Table view"
                                    >
                                        ☰ Table
                                    </button>
                                    <button
                                        className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
                                        onClick={() => setViewMode('grid')}
                                        title="Grid view"
                                    >
                                        ⊞ Grid
                                    </button>
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                                    {filteredAndSortedSubmissions.length} of {submissions.length} response{submissions.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            <div className="filter-search-bar">
                                <div className="search-box-wrapper">
                                    <input
                                        type="text"
                                        placeholder="Search responses..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                    />
                                    <span className="search-icon">🔍</span>
                                </div>

                                <div className="date-filters">
                                    <div className="date-input-group">
                                        <label>From:</label>
                                        <input
                                            type="date"
                                            value={dateRange.start}
                                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                        />
                                    </div>
                                    <div className="date-input-group">
                                        <label>To:</label>
                                        <input
                                            type="date"
                                            value={dateRange.end}
                                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                        />
                                    </div>
                                    {(dateRange.start || dateRange.end || searchQuery) && (
                                        <button
                                            className="btn-clear-filters"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setDateRange({ start: '', end: '' });
                                            }}
                                        >
                                            ✕ Clear
                                        </button>
                                    )}
                                </div>

                                {viewMode === 'grid' && submissions.length > 0 && (
                                    <div className="grid-select-all-row" style={{ marginTop: '12px', width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '20px' }}>
                                        <button
                                            className={`sb-btn ${isAllGridSelected ? 'sb-btn-active' : 'sb-btn-ghost'}`}
                                            onClick={handleToggleSelectAllGrid}
                                            style={{ fontSize: '13px', padding: '6px 20px', borderRadius: '8px', minWidth: '140px' }}
                                            title={isAllGridSelected ? 'Deselect all on this page' : 'Select all on this page'}
                                        >
                                            {isAllGridSelected ? '☑ Deselect ALL' : '☐ Select ALL'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Selection Actions Bar (Integrated like Dashboard) */}
                    {!loading && selectedIds.size > 0 && (
                        <div className="section-bar section-bar-published animate-in" style={{ marginBottom: '20px', borderRadius: '12px' }}>
                            <div className="section-bar-top">
                                <div className="section-sel-row">
                                    <span className="bulk-count">{selectedIds.size} selected</span>
                                    <button className="sb-btn sb-btn-ghost" onClick={clearSelection}>✕ Clear</button>
                                    {can('DELETE') && (
                                        <button className="sb-btn sb-btn-danger" onClick={() => setShowBulkConfirm(true)}>
                                            🗑 Delete {selectedIds.size}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Table View */}
                    {!loading && form && viewMode === 'table' && (
                        <div className="submissions-table-container">
                            <DataTable
                                data={filteredAndSortedSubmissions}
                                columns={columns()}
                                pageSize={pageSize}
                                currentPage={currentPage}
                                onPageChange={setCurrentPage}
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                selectedIds={selectedIds}
                                onToggleSelection={handleToggleSelection}
                            />
                        </div>
                    )}

                    {/* Grid View */}
                    {!loading && form && viewMode === 'grid' && (
                        submissions.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">📭</div>
                                <h3>No submissions yet</h3>
                                <p>Share the form link to collect responses</p>
                            </div>
                        ) : (
                            <div className="submissions-grid">
                                {filteredAndSortedSubmissions
                                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                                    .map((sub, idx) => (
                                        <div key={sub.id || idx} className="sub-grid-card">
                                            {/* Card header */}
                                            <div className="sub-grid-card-header">
                                                <span className="sub-grid-idx">#{((currentPage - 1) * pageSize) + idx + 1}</span>
                                                {form?.showTimestamp && (
                                                    <span className="sub-grid-date">
                                                        {sub.created_at
                                                            ? new Date(sub.created_at).toLocaleString('en-IN', {
                                                                day: 'numeric', month: 'short', year: 'numeric',
                                                                hour: '2-digit', minute: '2-digit'
                                                            })
                                                            : '—'}
                                                    </span>
                                                )}
                                                <span className="sub-grid-id" title={sub.id}>
                                                    {sub.id ? sub.id.substring(0, 8) + '…' : '—'}
                                                </span>
                                                <div style={{ marginTop: '8px' }}>
                                                    <span className={`badge ${sub.status === 'DRAFTED' ? 'badge-warning' : 'badge-number'}`} style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        whiteSpace: 'nowrap',
                                                        fontSize: '10px',
                                                        padding: '2px 8px'
                                                    }}>
                                                        <span>{sub.status === 'DRAFTED' ? '📝' : '✅'}</span>
                                                        <span>{sub.status === 'DRAFTED' ? 'Draft' : 'Submitted'}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Field values */}
                                            <div className="sub-grid-fields">
                                                {(form?.fields || []).map((field) => {
                                                    const raw = sub[field.fieldKey];
                                                    const isEmpty = raw === null || raw === undefined || raw === '';

                                                    return (
                                                        <div key={field.fieldKey} className="sub-grid-field">
                                                            <span className="sub-grid-field-label">{field.label}</span>
                                                            <span className="sub-grid-field-value">
                                                                {isEmpty ? (
                                                                    <span className="sub-empty">—</span>
                                                                ) : field.fieldType === 'file' ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        {String(raw).split(',').map(f => f.trim()).filter(Boolean).map((filename, idx) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => handleFileDownload(filename)}
                                                                                className="btn-file-download"
                                                                                style={{ fontSize: '12px', padding: '4px 8px' }}
                                                                                title={`Download: ${filename}`}
                                                                            >
                                                                                📎 {filename.length > 20 ? filename.substring(0, 20) + '...' : filename}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    formatCellValue(field, raw)
                                                                )}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Actions */}
                                            <div className="sub-grid-card-footer">
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setSelectedSubmission(sub)}
                                                    title="View details"
                                                >
                                                    👁 View
                                                </button>
                                                {can('EDIT') && (
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
                                                        onClick={() => openEdit(sub)}
                                                        title="Edit submission"
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                )}
                                                {can('DELETE') && (
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                                                        onClick={() => setDeletingSubmission(sub)}
                                                        title="Delete submission"
                                                    >
                                                        🗑 Delete
                                                    </button>
                                                )}
                                            </div>

                                            {/* ── Select checkbox (Grid View) ── */}
                                            <label
                                                className={`card-select-checkbox${selectedIds.has(sub.id) ? ' card-select-checked' : ''}`}
                                                onClick={(e) => e.stopPropagation()}
                                                title={selectedIds.has(sub.id) ? 'Deselect' : 'Select'}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(sub.id)}
                                                    onChange={() => handleToggleSelection([sub.id], !selectedIds.has(sub.id))}
                                                />
                                                <span className="card-select-mark">{selectedIds.has(sub.id) ? '✓' : ''}</span>
                                            </label>
                                        </div>
                                    ))}
                            </div>
                        )
                    )}

                    {/* Pagination for Grid view */}
                    {!loading && viewMode === 'grid' && filteredAndSortedSubmissions.length > pageSize && (
                        <div className="datatable-pagination" style={{ marginTop: '24px' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                            >
                                ‹ Previous
                            </button>

                            <div className="pagination-pages">
                                {Array.from({ length: Math.ceil(filteredAndSortedSubmissions.length / pageSize) }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>

                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredAndSortedSubmissions.length / pageSize), prev + 1))}
                                disabled={currentPage === Math.ceil(filteredAndSortedSubmissions.length / pageSize)}
                            >
                                Next ›
                            </button>
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
                                <label className="form-label">Status</label>
                                <div style={{ display: 'flex' }}>
                                    <span className={`badge ${selectedSubmission.status === 'DRAFTED' ? 'badge-warning' : 'badge-number'}`} style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        padding: '4px 12px',
                                        fontWeight: 'bold',
                                        color: selectedSubmission.status === 'DRAFTED' ? '#FCD34D' : '#34D399'
                                    }}>
                                        <span>{selectedSubmission.status === 'DRAFTED' ? '📝' : '✅'}</span>
                                        <span>{selectedSubmission.status === 'DRAFTED' ? 'DRAFTED' : 'SUBMITTED'}</span>
                                    </span>
                                </div>
                            </div>
                            {form?.showTimestamp && (
                                <div className="form-group">
                                    <label className="form-label">Submitted At</label>
                                    <div className="sub-readonly-field">
                                        {selectedSubmission.created_at ? new Date(selectedSubmission.created_at).toLocaleString('en-IN') : '—'}
                                    </div>
                                </div>
                            )}
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
                                                try { obj = JSON.parse(String(value)); } catch { }
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
                                                try { obj = JSON.parse(String(value)); } catch { }
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
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <div style={{ display: 'flex' }}>
                                    <span className={`badge ${editingSubmission.status === 'DRAFTED' ? 'badge-warning' : 'badge-number'}`} style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        padding: '4px 12px',
                                        fontWeight: 'bold',
                                        color: editingSubmission.status === 'DRAFTED' ? '#FCD34D' : '#34D399'
                                    }}>
                                        <span>{editingSubmission.status === 'DRAFTED' ? '📝' : '✅'}</span>
                                        <span>{editingSubmission.status === 'DRAFTED' ? 'DRAFTED' : 'SUBMITTED'}</span>
                                    </span>
                                </div>
                            </div>
                            <div className="sub-divider" />
                            {editableFields.filter(f => f.fieldType !== 'file').map((field) => (
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
                                {editLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : '💾 Save Changes'}
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
                                {deleteLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Deleting…</> : '🗑 Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Bulk Delete Confirmation Modal ── */}
            {showBulkConfirm && (
                <div className="modal-overlay" onClick={() => !bulkDeleting && setShowBulkConfirm(false)}>
                    <div className="modal-box sub-modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">🗑 Bulk Delete Submissions</span>
                            <button className="modal-close" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="sub-delete-msg">
                                Are you sure you want to delete <strong>{selectedIds.size}</strong> submissions? This action cannot be undone.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                                {bulkDeleting ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Deleting…</> : `🗑 Delete ${selectedIds.size} Submissions`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

