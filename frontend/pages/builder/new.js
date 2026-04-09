import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toastError } from '../../services/toast';

const CODE_REGEX = /^[a-z_]+$/;
const FORM_NAME_ALLOWED_REGEX = /^[A-Za-z_][A-Za-z0-9_ ]*$/;
const NEW_FORM_META_KEY = 'builder_new_form_meta_v1';

const normalizeCode = (value = '') => value.toLowerCase().trim();
const sanitizeFormName = (value = '') => value.replace(/[^A-Za-z0-9_ ]+/g, '').replace(/\s{2,}/g, ' ');

const getFormNameError = (value, { requireValue = false } = {}) => {
    const normalized = sanitizeFormName(value).trim();
    if (!normalized) {
        return requireValue ? 'Form name is required.' : '';
    }
    if (normalized.length < 3) {
        return 'Form name must be at least 3 characters.';
    }
    if (!FORM_NAME_ALLOWED_REGEX.test(normalized)) {
        return 'Form name must start with a letter or underscore and contain only letters, numbers, spaces, and underscores.';
    }
    return '';
};

const getCodeError = (value, { requireValue = false } = {}) => {
    const normalized = normalizeCode(value);
    if (!normalized) {
        return requireValue ? 'Code is required and must use lowercase letters and underscores only.' : '';
    }
    if (!CODE_REGEX.test(normalized)) {
        return 'Code must contain only lowercase letters and underscores. Numbers and special characters are not allowed.';
    }
    return '';
};

export default function NewBuilderPage() {
    const router = useRouter();
    const [formName, setFormName] = useState('');
    const [nameError, setNameError] = useState('');
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const handleCreate = async (e) => {
        e.preventDefault();

        const normalizedName = sanitizeFormName(formName).trim();
        const normalizedCode = normalizeCode(code);
        const formNameValidationError = getFormNameError(normalizedName, { requireValue: true });
        const validationError = getCodeError(normalizedCode, { requireValue: true });

        if (formNameValidationError) {
            setNameError(formNameValidationError);
            toastError(formNameValidationError);
            return;
        }

        if (validationError) {
            setCodeError(validationError);
            toastError('Please provide a valid form code.');
            return;
        }

        setSaving(true);
        try {
            const pendingMeta = {
                name: normalizedName,
                code: normalizedCode,
                description: formDescription.trim() || null,
            };

            if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(NEW_FORM_META_KEY, JSON.stringify(pendingMeta));
            }

            router.push('/builder/new-form');
        } catch (err) {
            toastError(err.message || 'Failed to continue to builder.');
            setSaving(false);
        }
    };

    return (
        <>
            <Head>
                <title>New Form — FormCraft Builder</title>
            </Head>

            <div className="builder-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <header className="builder-topbar" style={{ justifyContent: 'flex-start', gap: 14 }}>
                    <Link href="/dashboard" className="builder-topbar-brand" title="Back to Dashboard">
                        ⚡ FormCraft
                    </Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>Create a new form</span>
                </header>

                <main className="builder-create-shell">
                    <form onSubmit={handleCreate} className="builder-create-card card">
                        <div className="builder-create-header">
                            <span className="builder-create-kicker">New form</span>
                            <h1 className="builder-create-title">Create your form details first</h1>
                            <p className="builder-create-subtitle">
                                Enter the form name, a unique lowercase code, and an optional description.
                                After that, you’ll move into the builder to design fields. The form will be created only when you save from builder.
                            </p>
                        </div>

                        <div className="builder-create-grid">
                            <div className="builder-create-field">
                                <label htmlFor="form-name-input">Form name</label>
                                <input
                                    id="form-name-input"
                                    className="form-input"
                                    placeholder="Untitled Form"
                                    value={formName}
                                    onChange={(e) => {
                                        const nextValue = sanitizeFormName(e.target.value);
                                        setFormName(nextValue);
                                        setNameError(getFormNameError(nextValue));
                                    }}
                                    maxLength={255}
                                    autoFocus
                                    style={{
                                        borderColor: nameError ? 'rgba(248, 113, 113, 0.85)' : undefined,
                                        boxShadow: nameError ? '0 0 0 1px rgba(248, 113, 113, 0.45)' : undefined,
                                    }}
                                />
                                <div className="builder-create-help" style={{ color: nameError ? '#FCA5A5' : 'var(--text-muted)' }}>
                                    {nameError || 'Please follow these name rules:'}
                                </div>
                                <div className="builder-create-rules">
                                    <div className="builder-create-rule">- Minimum 3 characters</div>
                                    <div className="builder-create-rule">- Must start with a letter or underscore</div>
                                    <div className="builder-create-rule">- Allowed: letters, numbers, spaces, underscore (`_`)</div>
                                </div>
                            </div>

                            <div className="builder-create-field">
                                <label htmlFor="form-code-input">Form code</label>
                                <input
                                    id="form-code-input"
                                    className="form-input"
                                    placeholder="employee_onboarding"
                                    value={code}
                                    onChange={(e) => {
                                        const nextValue = normalizeCode(e.target.value);
                                        setCode(nextValue);
                                        setCodeError(getCodeError(nextValue));
                                    }}
                                    maxLength={100}
                                    style={{
                                        borderColor: codeError ? 'rgba(248, 113, 113, 0.85)' : undefined,
                                        boxShadow: codeError ? '0 0 0 1px rgba(248, 113, 113, 0.45)' : undefined,
                                    }}
                                />
                                <div className="builder-create-help" style={{ color: codeError ? '#FCA5A5' : 'var(--text-muted)' }}>
                                    {codeError || 'Please follow these code rules:'}
                                </div>
                                <div className="builder-create-rules">
                                    <div className="builder-create-rule">- Code is required</div>
                                    <div className="builder-create-rule">- Lowercase letters and underscore (`_`) only</div>
                                    <div className="builder-create-rule">- Numbers and special characters are not allowed</div>
                                    <div className="builder-create-rule">- Code cannot be changed after first save</div>
                                </div>
                            </div>

                            <div className="builder-create-field">
                                <label htmlFor="form-description-input">Description</label>
                                <textarea
                                    id="form-description-input"
                                    className="form-input"
                                    placeholder="Optional description for the form"
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    rows={4}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            <div className="builder-create-footer">
                                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                                    Form is created only after you click Save in builder.
                                </span>
                                <button className="btn btn-primary" type="submit" disabled={saving} style={{ fontSize: 15, padding: '12px 20px' }}>
                                    {saving ? 'Opening Builder…' : 'Continue to Builder'}
                                </button>
                            </div>
                        </div>
                    </form>
                </main>
            </div>
        </>
    );
}
