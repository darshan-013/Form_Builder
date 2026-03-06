import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import { getForm, updateForm } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block']);

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

    // Load existing form (dynamic fields + static fields merged by fieldOrder)
    useEffect(() => {
        if (!id) return;
        getForm(id)
            .then((form) => {
                setFormName(form.name || '');
                setFormDescription(form.description || '');

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
            name:         formName.trim(),
            description:  formDescription.trim() || null,
            fields:       dynamicFields,
            staticFields: staticFields,
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

    const dynamicCount = fields.filter(f => !STATIC_TYPES.has(f.fieldType)).length;
    const staticCount  = fields.filter(f => STATIC_TYPES.has(f.fieldType)).length;

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
                    <Canvas fields={fields} setFields={setFields} />
                </main>
            </div>
        </>
    );
}
