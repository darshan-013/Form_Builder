import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import { createForm } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

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
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!formName.trim()) {
            toastError('Please enter a form name before saving.');
            return;
        }

        const dto = {
            name: formName.trim(),
            description: formDescription.trim() || null,
            fields: fields.map((f, i) => ({
                fieldKey: f.fieldKey || `field_${i}`,
                label: f.label || `Field ${i + 1}`,
                fieldType: f.fieldType,
                required: f.required,
                defaultValue: f.defaultValue || null,
                validationRegex: f.validationRegex || null,
                validationJson: f.validationJson || null,
                rulesJson: f.rulesJson || null,
                sharedOptionsId: f.sharedOptionsId || null,
                fieldOrder: i,
            })),
        };


        setSaving(true);
        try {
            const created = await createForm(dto);
            toastSuccess('Form Created Successfully! 🎉');
            router.push('/dashboard');
        } catch (err) {
            const msg = err.message || 'Failed to create form.';
            toastError(msg);
        } finally {
            setSaving(false);
        }
    };

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
                        {fields.length > 0 && (
                            <span className="badge badge-text">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
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
                    <Canvas fields={fields} setFields={setFields} />
                </main>
            </div>
        </>
    );
}
