import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import { createForm } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

/**
 * New Form Builder Page — /builder/new
 *
 * State:
 *   formName, formDescription  — top-bar inputs
 *   fields                     — array managed by Canvas
 *
 * On Save:
 *   POST /api/forms → backend creates form rows + physical table
 *   Toast success/error
 */
export default function NewBuilderPage() {
    const router = useRouter();
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [fields, setFields] = useState([]);
    const [groups, setGroups] = useState([]);
    const [saving, setSaving] = useState(false);
    const [allowMultipleSubmissions, setAllowMultipleSubmissions] = useState(true);
    const [expiresAt, setExpiresAt] = useState(''); // ISO string or ''

    const handleSave = async () => {
        if (!formName.trim()) {
            toastError('Please enter a form name before saving.');
            return;
        }

        const dynamicFields = [];
        const staticFields = [];

        fields.forEach((f, i) => {
            if (STATIC_TYPES.has(f.fieldType)) {
                staticFields.push({
                    id: f.id,
                    fieldType: f.fieldType,
                    data: f.data || '',
                    fieldOrder: i,
                });
            } else {
                dynamicFields.push({
                    id: f.id,
                    fieldKey: f.fieldKey || `field_${i}`,
                    label: f.label || `Field ${i + 1}`,
                    fieldType: f.fieldType,
                    required: f.required,
                    defaultValue: f.defaultValue || null,
                    validationRegex: f.validationRegex || null,
                    validationJson: f.validationJson || null,
                    rulesJson: f.rulesJson || null,
                    uiConfigJson: f.uiConfigJson || null,
                    sharedOptionsId: f.sharedOptionsId || null,
                    fieldOrder: i,
                    // Calculated fields persistence
                    isCalculated: f.isCalculated || false,
                    formulaExpression: f.isCalculated ? (f.formulaExpression || null) : null,
                    precision: f.isCalculated ? (f.precision ?? 2) : 2,
                    lockAfterCalculation: f.isCalculated ? (f.lockAfterCalculation || false) : false,
                    parentGroupKey: f.parentGroupKey || null,
                    dependencies: f.dependencies || [],
                    disabled: f.disabled || false,
                    readOnly: f.readOnly || false,
                    groupId: f.groupId || null,
                });
            }
        });

        const dto = {
            name: formName.trim(),
            description: formDescription.trim() || null,
            fields: dynamicFields,
            staticFields: staticFields,
            groups: groups.map((g, i) => ({
                id: g.id,
                groupTitle: g.groupTitle || 'Untitled Section',
                groupDescription: g.groupDescription || '',
                groupOrder: i,
                rulesJson: g.rulesJson || null,
            })),
            allowMultipleSubmissions: allowMultipleSubmissions,
            showTimestamp: true, // always recorded — compulsory
            expiresAt: expiresAt ? expiresAt : null,
        };

        setSaving(true);
        try {
            await createForm(dto);
            toastSuccess('Form Created Successfully! 🎉');
            router.push('/dashboard');
        } catch (err) {
            toastError(err.message || 'Failed to create form.');
        } finally {
            setSaving(false);
        }
    };

    const totalCount = fields.length;
    const dynamicCount = fields.filter(f => !STATIC_TYPES.has(f.fieldType)).length;
    const staticCount = fields.filter(f => STATIC_TYPES.has(f.fieldType) && f.fieldType !== 'page_break').length;
    const pageBreakCount = fields.filter(f => f.fieldType === 'page_break').length;
    const pageCount = pageBreakCount + 1; // pages = breaks + 1

    return (
        <>
            <Head>
                <title>New Form — FormCraft Builder</title>
            </Head>

            <div className="builder-page">
                {/* ── Top Bar ─────────────────────────────────────────── */}
                <header className="builder-topbar">
                    <Link href="/dashboard" className="builder-topbar-brand" title="Back to Dashboard">
                        ⚡ FormCraft
                    </Link>

                    <input
                        id="form-name-input"
                        className="builder-form-name-input"
                        placeholder="Untitled Form…"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        maxLength={150}
                    />

                    <input
                        id="form-desc-input"
                        className="builder-form-name-input"
                        style={{ maxWidth: 240, fontWeight: 400, fontSize: 13 }}
                        placeholder="Description (optional)"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                    />

                    <div className="builder-topbar-actions">
                        {/* Field count badge */}
                        {totalCount > 0 && (
                            <span className="badge badge-text">
                                {dynamicCount} field{dynamicCount !== 1 ? 's' : ''}
                                {staticCount > 0 ? ` + ${staticCount} static` : ''}
                                {pageBreakCount > 0 ? ` · ${pageCount} pages` : ''}
                            </span>
                        )}

                        {/* Preview (navigates to /preview/:id — only after save) */}
                        <Link href="/dashboard" className="btn btn-secondary btn-sm">
                            ← Cancel
                        </Link>

                        <button
                            id="save-form-btn"
                            className="btn btn-primary btn-sm"
                            onClick={handleSave}
                            disabled={saving || !formName.trim()}
                        >
                            {saving ? (
                                <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</>
                            ) : (
                                '💾 Save Form'
                            )}
                        </button>
                    </div>
                </header>

                {/* ── Left Palette ─────────────────────────────────────── */}
                <FieldPalette />

                {/* ── Canvas ───────────────────────────────────────────── */}
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

                    <Canvas fields={fields} setFields={setFields} groups={groups} setGroups={setGroups} />
                </main>
            </div>
        </>
    );
}
