import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import { getForm, updateForm } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

/**
 * Edit Form Builder Page — /builder/[id]
 * Loads existing form, allows editing fields, then PUTs changes.
 * DynamicTableService in backend will diff and ALTER TABLE accordingly.
 */
export default function EditBuilderPage() {
    const router = useRouter();
    const { id } = router.query;

    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [fields, setFields] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [allowMultipleSubmissions, setAllowMultipleSubmissions] = useState(true);
    const [expiresAt, setExpiresAt] = useState(''); // ISO string or ''

    // Load existing form (dynamic fields + static fields merged by fieldOrder)
    useEffect(() => {
        if (!id) return;
        getForm(id)
            .then((form) => {
                setFormName(form.name || '');
                setFormDescription(form.description || '');
                setAllowMultipleSubmissions(form.allowMultipleSubmissions ?? true);
                // Load expiry — convert from ISO to datetime-local format (YYYY-MM-DDTHH:mm)
                if (form.expiresAt) {
                    setExpiresAt(new Date(form.expiresAt).toISOString().slice(0, 16));
                } else {
                    setExpiresAt('');
                }

                // Dynamic fields
                const dynFields = (form.fields || []).map((f) => ({
                    id:              f.id,
                    fieldType:       f.fieldType,
                    isStatic:        false,
                    label:           f.label,
                    fieldKey:        f.fieldKey,
                    required:        f.required,
                    defaultValue:    f.defaultValue || '',
                    validationRegex: f.validationRegex || '',
                    sharedOptionsId: f.sharedOptionsId || null,
                    validationJson:  f.validationJson || null,
                    rulesJson:       f.rulesJson || null,
                    uiConfigJson:    f.uiConfigJson || null,
                    fieldOrder:      f.fieldOrder,
                }));

                // Static fields from the new staticFields array in response
                const statFields = (form.staticFields || []).map((sf) => ({
                    id:         sf.id,
                    fieldType:  sf.fieldType,
                    isStatic:   true,
                    data:       sf.data || '',
                    fieldOrder: sf.fieldOrder,
                }));

                // Merge and sort by fieldOrder
                const merged = [...dynFields, ...statFields]
                    .sort((a, b) => a.fieldOrder - b.fieldOrder);
                setFields(merged);
            })
            .catch(() => toastError('Failed to load form.'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleSave = async () => {
        if (!formName.trim()) { toastError('Form name is required.'); return; }

        const dynamicFields = [];
        const staticFields  = [];

        fields.forEach((f, i) => {
            if (STATIC_TYPES.has(f.fieldType)) {
                staticFields.push({
                    fieldType:  f.fieldType,
                    data:       f.data || '',
                    fieldOrder: i,
                });
            } else {
                dynamicFields.push({
                    fieldKey:        f.fieldKey || `field_${i}`,
                    label:           f.label || `Field ${i + 1}`,
                    fieldType:       f.fieldType,
                    required:        f.required,
                    defaultValue:    f.defaultValue || null,
                    validationRegex: f.validationRegex || null,
                    validationJson:  f.validationJson || null,
                    rulesJson:       f.rulesJson || null,
                    uiConfigJson:    f.uiConfigJson || null,
                    sharedOptionsId: f.sharedOptionsId || null,
                    fieldOrder:      i,
                });
            }
        });

        const dto = {
            name:                    formName.trim(),
            description:             formDescription.trim() || null,
            fields:                  dynamicFields,
            staticFields:            staticFields,
            allowMultipleSubmissions: allowMultipleSubmissions,
            showTimestamp:           true, // always recorded — compulsory
            expiresAt:               expiresAt ? expiresAt : null,
        };

        setSaving(true);
        try {
            await updateForm(id, dto);
            toastSuccess('Form Updated Successfully! ✓');
            router.push('/dashboard');
        } catch (err) {
            toastError(err.message || 'Failed to update form.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-center" style={{ height: '100vh', background: 'var(--bg-base)' }}>
                <span className="spinner" style={{ width: 36, height: 36 }} />
            </div>
        );
    }

    const dynamicCount   = fields.filter(f => !STATIC_TYPES.has(f.fieldType)).length;
    const staticCount    = fields.filter(f => STATIC_TYPES.has(f.fieldType) && f.fieldType !== 'page_break').length;
    const pageBreakCount = fields.filter(f => f.fieldType === 'page_break').length;
    const pageCount      = pageBreakCount + 1;

    return (
        <>
            <Head><title>Edit Form — FormCraft Builder</title></Head>

            <div className="builder-page">
                <header className="builder-topbar">
                    <Link href="/dashboard" className="builder-topbar-brand">⚡ FormCraft</Link>

                    <input
                        className="builder-form-name-input"
                        placeholder="Form name…"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                    />
                    <input
                        className="builder-form-name-input"
                        style={{ maxWidth: 240, fontWeight: 400, fontSize: 13 }}
                        placeholder="Description (optional)"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                    />

                    <div className="builder-topbar-actions">
                        {fields.length > 0 && (
                            <span className="badge badge-text">
                                {dynamicCount} field{dynamicCount !== 1 ? 's' : ''}
                                {staticCount > 0 ? ` + ${staticCount} static` : ''}
                                {pageBreakCount > 0 ? ` · ${pageCount} pages` : ''}
                            </span>
                        )}
                        <Link href={`/preview/${id}`} className="btn btn-secondary btn-sm">👁 Preview</Link>
                        <button
                            id="update-form-btn"
                            className="btn btn-primary btn-sm"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving
                                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</>
                                : '💾 Save Changes'}
                        </button>
                    </div>
                </header>

                <FieldPalette />
                <main className="builder-canvas-wrap">
                    {/* ── Form Settings Panel ─────────────────────── */}
                    <div className="form-settings-panel">
                        <div className="form-settings-title">
                            ⚙️ Form Settings
                            <span style={{ fontWeight: 400, fontSize: 11, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--text-muted)' }}>(all optional)</span>
                        </div>

                        {/* Toggle: Limit to one submission */}
                        <div className="form-settings-toggle" onClick={() => setAllowMultipleSubmissions(v => !v)}>
                            <div className="form-settings-toggle-info">
                                <span className="form-settings-toggle-label">🔒 Limit to one submission</span>
                                <span className="form-settings-toggle-desc">Each person can only submit this form once per session</span>
                            </div>
                            <div className={`toggle-switch${!allowMultipleSubmissions ? ' toggle-on' : ''}`} role="switch" aria-checked={!allowMultipleSubmissions}>
                                <div className="toggle-knob" />
                            </div>
                        </div>

                        {/* Expiry date-time picker */}
                        <div className="form-settings-expiry">
                            <div className="form-settings-expiry-info">
                                <span className="form-settings-toggle-label">📅 Form expiry</span>
                                <span className="form-settings-toggle-desc">
                                    {expiresAt
                                        ? `Closes on ${new Date(expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                                        : 'No expiry — form stays open indefinitely'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="datetime-local"
                                    className="form-input form-settings-date-input"
                                    value={expiresAt}
                                    min={new Date().toISOString().slice(0, 16)}
                                    onChange={e => setExpiresAt(e.target.value)}
                                    title="Set form expiry date and time"
                                />
                                {expiresAt && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setExpiresAt('')}
                                        title="Clear expiry"
                                        style={{ whiteSpace: 'nowrap', padding: '6px 10px' }}
                                    >
                                        ✕ Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <Canvas fields={fields} setFields={setFields} />
                </main>
            </div>
        </>
    );
}
