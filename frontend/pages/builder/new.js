import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Layout, Type, Code, FileText, ArrowRight, AlertCircle, CheckCircle2, Loader2, Library } from 'lucide-react';
import { toastError } from '../../services/toast';
import { checkFormCodeUniqueness } from '../../services/api';

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
        return 'Use only letters, numbers, spaces, and underscores.';
    }
    return '';
};

const getCodeError = (value, { requireValue = false } = {}) => {
    const normalized = normalizeCode(value);
    if (!normalized) {
        return requireValue ? 'Code is required.' : '';
    }
    if (!CODE_REGEX.test(normalized)) {
        return 'Use lowercase letters and underscores only.';
    }
    return '';
};

export default function NewBuilderPage() {
    const router = useRouter();
    const [formName, setFormName] = useState('');
    const [nameError, setNameError] = useState('');
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState('');
    const [isCheckingCode, setIsCheckingCode] = useState(false);
    const [isCodeAvailable, setIsCodeAvailable] = useState(null); // null, true, false
    const [formDescription, setFormDescription] = useState('');
    const [saving, setSaving] = useState(false);

    // Debounced Code Uniqueness Check
    useEffect(() => {
        if (!code || code.length < 2) {
            setIsCodeAvailable(null);
            setIsCheckingCode(false);
            return;
        }

        const formatError = getCodeError(code);
        if (formatError) {
            setIsCodeAvailable(null);
            setIsCheckingCode(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsCheckingCode(true);
            try {
                const res = await checkFormCodeUniqueness(code);
                setIsCodeAvailable(res.isUnique);
                if (!res.isUnique) {
                    setCodeError('This code is already in use by another form.');
                } else {
                    setCodeError('');
                }
            } catch (err) {
                console.error('Failed to check code:', err);
            } finally {
                setIsCheckingCode(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [code]);

    const handleCreate = async (e) => {
        if (e) e.preventDefault();

        const normalizedName = sanitizeFormName(formName).trim();
        const normalizedCode = normalizeCode(code);
        const formNameValidationError = getFormNameError(normalizedName, { requireValue: true });
        const formatValidationErr = getCodeError(normalizedCode, { requireValue: true });

        if (formNameValidationError) {
            setNameError(formNameValidationError);
            toastError(formNameValidationError);
            return;
        }

        if (formatValidationErr) {
            setCodeError(formatValidationErr);
            toastError(formatValidationErr);
            return;
        }

        if (isCodeAvailable === false) {
            toastError('Please use a unique form code.');
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

            // Small delay for smooth transition
            setTimeout(() => {
                router.push('/builder/new-form');
            }, 400);
        } catch (err) {
            toastError(err.message || 'Failed to continue to builder.');
            setSaving(false);
        }
    };

    const isFormValid = formName && code && !nameError && !codeError && isCodeAvailable === true && !isCheckingCode;

    return (
        <div className="builder-new-page">
            <Head>
                <title>Initialize Workspace — FormCraft</title>
            </Head>

            {/* Background Decorations */}
            <div className="builder-new-orb builder-new-orb-right" />
            <div className="builder-new-orb builder-new-orb-left" />

            {/* Topbar */}
            <header className="builder-new-topbar">
                <div className="builder-new-topbar-inner">
                    <div className="builder-new-brand-wrap">
                        <Link href="/dashboard" className="builder-new-brand-link">
                            <div className="builder-new-brand-icon">
                                <Layout size={22} />
                            </div>
                            <span className="builder-new-brand-text">FormCraft</span>
                        </Link>
                        <div className="builder-new-brand-divider" />
                        <span className="builder-new-brand-meta">Master Wizard</span>
                    </div>
                    <div className="builder-new-topbar-actions">
                        <Link href="/forms/vault" className="builder-new-link-btn builder-new-link-btn-secondary">
                            <Library size={18} /> Form Vault
                        </Link>
                        <Link href="/dashboard" className="builder-new-link-btn builder-new-link-btn-primary">
                            Dashboard
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Area */}
            <main className="builder-new-main">
                <div className="builder-new-main-inner">

                    {/* Left Hero */}
                    <div className="builder-new-hero">
                        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
                            <div className="builder-new-kicker">
                                Protocol Overview
                            </div>
                            <h1 className="builder-new-title-main">
                                Name your creation,
                            </h1>
                            <div className="builder-new-title-accent-wrap">
                                <span className="builder-new-title-accent">define its soul.</span>
                                <div className="builder-new-title-underline" />
                            </div>
                            
                            <p className="builder-new-subtitle">
                                Every great project starts with a clear intent. Initialize your dynamic workspace to begin drafting fields, logic, and automated workflows.
                            </p>

                            <div className="builder-new-feature-list">
                                <div className="builder-new-feature-item">
                                    <div className="builder-new-feature-icon is-purple">
                                        <Type size={28} />
                                    </div>
                                    <div>
                                        <h4 className="builder-new-feature-title">Form Name</h4>
                                        <p className="builder-new-feature-text">The display name for your form.</p>
                                    </div>
                                </div>
                                <div className="builder-new-feature-item">
                                    <div className="builder-new-feature-icon is-green">
                                        <Code size={28} />
                                    </div>
                                    <div>
                                        <h4 className="builder-new-feature-title">Form Code</h4>
                                        <p className="builder-new-feature-text">A unique identifier for your form.</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Card */}
                    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="builder-new-form-wrap">
                        <form onSubmit={handleCreate} className="builder-new-form-card">
                            <div>
                                <label className="builder-new-field-group-label">Basic Information</label>

                                <div className={`builder-new-input-shell ${nameError ? 'is-error' : ''}`}>
                                    <Type size={22} className={`builder-new-input-icon ${nameError ? 'is-error' : ''}`} />
                                    <input
                                        placeholder="Form Name"
                                        value={formName}
                                        onChange={(e) => {
                                            const val = sanitizeFormName(e.target.value);
                                            setFormName(val);
                                            setNameError(getFormNameError(val));
                                        }}
                                        className="builder-new-input"
                                        autoFocus
                                    />
                                </div>
                                {nameError && <p className="builder-new-error with-negative-top">{nameError}</p>}

                                <div className={`builder-new-input-shell ${codeError ? 'is-error' : ''} ${isCodeAvailable === true && !codeError ? 'is-success' : ''}`}>
                                    <Code size={22} className={`builder-new-input-icon ${codeError ? 'is-error' : ''} ${isCodeAvailable === true && !codeError ? 'is-success' : ''}`} />
                                    <input
                                        placeholder="form_code"
                                        value={code}
                                        onChange={(e) => {
                                            const val = normalizeCode(e.target.value);
                                            setCode(val);
                                            setCodeError(getCodeError(val));
                                        }}
                                        className="builder-new-input"
                                    />
                                    {isCheckingCode ? <Loader2 size={20} className="animate-spin builder-new-status-icon" /> : isCodeAvailable === true ? <CheckCircle2 size={20} className="builder-new-status-icon is-success" /> : isCodeAvailable === false ? <AlertCircle size={20} className="builder-new-status-icon is-error" /> : null}
                                </div>
                                {codeError && <p className="builder-new-error">{codeError}</p>}
                            </div>

                            <div>
                                <label className="builder-new-field-group-label">Description</label>
                                <div className="builder-new-textarea-shell">
                                    <FileText size={22} className="builder-new-input-icon with-offset" />
                                    <textarea
                                        placeholder="What is this form for? (optional)"
                                        rows={3}
                                        value={formDescription}
                                        onChange={(e) => setFormDescription(e.target.value)}
                                        className="builder-new-textarea"
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={saving || !isFormValid} className="builder-new-submit-btn">
                                {saving ? <Loader2 className="animate-spin" size={24} /> : <>Create Form <ArrowRight size={20} /></>}
                            </button>
                        </form>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
