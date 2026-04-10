import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout, Type, Code, FileText, ArrowRight, ChevronLeft, AlertCircle, CheckCircle2, Loader2, Library } from 'lucide-react';
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
        <div style={{ 
            background: '#F1F5F9', 
            minHeight: '100vh', 
            display: 'flex', 
            flexDirection: 'column',
            width: '100%',
            position: 'relative',
            overflowX: 'hidden',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            <Head>
                <title>Initialize Workspace — FormCraft</title>
            </Head>

            {/* Background Decorations */}
            <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)', zIndex: 0 }} />
            <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)', zIndex: 0 }} />

            {/* Topbar */}
            <header style={{ 
                zIndex: 100, 
                width: '100%',
                background: 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(30px)',
                borderBottom: '1px solid #E2E8F0'
            }}>
                <div style={{ width: '1300px', margin: '0 auto', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 50px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 8px 16px rgba(139, 92, 246, 0.2)' }}>
                                <Layout size={22} />
                            </div>
                            <span style={{ fontWeight: 900, fontSize: '22px', color: '#0F172A', letterSpacing: '-0.03em' }}>FormCraft</span>
                        </Link>
                        <div style={{ height: '30px', width: '1px', background: '#E2E8F0' }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Master Wizard</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <Link href="/forms/vault" style={{ textDecoration: 'none', padding: '12px 28px', borderRadius: '14px', background: 'white', border: '1px solid #E2E8F0', color: '#475569', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <Library size={18} /> Form Vault
                        </Link>
                        <Link href="/dashboard" style={{ textDecoration: 'none', padding: '12px 28px', borderRadius: '14px', background: '#0F172A', color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: '0 10px 20px rgba(15, 23, 42, 0.2)' }}>
                            Dashboard
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Area */}
            <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                <div style={{ width: '1300px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '120px', padding: '80px 50px' }}>
                    
                    {/* Left Hero */}
                    <div style={{ width: '640px', flexShrink: 0 }}>
                        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
                            <div style={{ display: 'inline-flex', padding: '10px 24px', borderRadius: '24px', background: 'rgba(139, 92, 246, 0.12)', color: '#7C3AED', fontSize: '12px', fontWeight: 800, marginBottom: '32px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Protocol Overview
                            </div>
                            <h1 style={{ fontSize: '72px', fontWeight: 1000, lineHeight: '1.1', color: '#0F172A', marginBottom: '12px', letterSpacing: '-0.04em' }}>
                                Name your creation,
                            </h1>
                            <div style={{ marginBottom: '40px' }}>
                                <span style={{ fontSize: '72px', fontWeight: 1000, color: '#8B5CF6', letterSpacing: '-0.04em' }}>define its soul.</span>
                                <div style={{ height: '6px', width: '140px', background: 'linear-gradient(90deg, #8B5CF6, #6366F1)', borderRadius: '3px', marginTop: '12px' }} />
                            </div>
                            
                            <p style={{ fontSize: '20px', color: '#475569', lineHeight: '1.8', marginBottom: '56px', maxWidth: '540px' }}>
                                Every great project starts with a clear intent. Initialize your dynamic workspace to begin drafting fields, logic, and automated workflows.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                    <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'white', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6', boxShadow: '0 8px 20px rgba(0,0,0,0.04)' }}>
                                        <Type size={28} />
                                    </div>
                                    <div>
                                        <h4 style={{ fontWeight: 800, fontSize: '18px', color: '#1E293B', marginBottom: '4px' }}>Master Brand Identity</h4>
                                        <p style={{ fontSize: '15px', color: '#64748B' }}>The definitive name for your vault entry.</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                    <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'white', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981', boxShadow: '0 8px 20px rgba(0,0,0,0.04)' }}>
                                        <Code size={28} />
                                    </div>
                                    <div>
                                        <h4 style={{ fontWeight: 800, fontSize: '18px', color: '#1E293B', marginBottom: '4px' }}>Semantic Routing Key</h4>
                                        <p style={{ fontSize: '15px', color: '#64748B' }}>A unique lowercase key for database mapping.</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Card */}
                    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} style={{ width: '540px', flexShrink: 0 }}>
                        <form onSubmit={handleCreate} style={{ 
                            background: 'white', 
                            padding: '56px', 
                            borderRadius: '48px', 
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 40px 80px -15px rgba(0, 0, 0, 0.12)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '32px'
                        }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px', display: 'block' }}>Identity Hub</label>
                                
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: '16px', padding: '0 24px', height: '80px', borderRadius: '20px', background: '#F8FAFC', border: nameError ? '2px solid #EF4444' : '1px solid #E2E8F0', marginBottom: '20px'
                                }}>
                                    <Type size={22} color={nameError ? '#EF4444' : '#64748B'} />
                                    <input 
                                        placeholder="Form Name"
                                        value={formName}
                                        onChange={(e) => {
                                            const val = sanitizeFormName(e.target.value);
                                            setFormName(val);
                                            setNameError(getFormNameError(val));
                                        }}
                                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '17px', fontWeight: 600, color: '#1E293B' }}
                                        autoFocus
                                    />
                                </div>
                                {nameError && <p style={{ color: '#EF4444', fontSize: '13px', fontWeight: 700, marginTop: '-12px', marginBottom: '16px', marginLeft: '6px' }}>{nameError}</p>}

                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: '16px', padding: '0 24px', height: '80px', borderRadius: '20px', background: '#F8FAFC', border: codeError ? '2px solid #EF4444' : (isCodeAvailable === true ? '2px solid #10B981' : '1px solid #E2E8F0')
                                }}>
                                    <Code size={22} color={codeError ? '#EF4444' : (isCodeAvailable === true ? '#10B981' : '#64748B')} />
                                    <input 
                                        placeholder="form_code"
                                        value={code}
                                        onChange={(e) => {
                                            const val = normalizeCode(e.target.value);
                                            setCode(val);
                                            setCodeError(getCodeError(val));
                                        }}
                                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '17px', fontWeight: 600, color: '#1E293B' }}
                                    />
                                    {isCheckingCode ? <Loader2 size={20} className="animate-spin" color="#94A3B8" /> : isCodeAvailable === true ? <CheckCircle2 size={20} color="#10B981" /> : isCodeAvailable === false ? <AlertCircle size={20} color="#EF4444" /> : null}
                                </div>
                                {codeError && <p style={{ color: '#EF4444', fontSize: '13px', fontWeight: 700, marginTop: '8px', marginLeft: '6px' }}>{codeError}</p>}
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px', display: 'block' }}>Narrative Focus</label>
                                <div style={{ 
                                    display: 'flex', gap: '16px', padding: '24px', borderRadius: '24px', background: '#F8FAFC', border: '1px solid #E2E8F0'
                                }}>
                                    <FileText size={22} color="#64748B" style={{ marginTop: '2px' }} />
                                    <textarea 
                                        placeholder="Define the primary intent of this project..."
                                        rows={3}
                                        value={formDescription}
                                        onChange={(e) => setFormDescription(e.target.value)}
                                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '16px', lineHeight: '1.7', color: '#1E293B', resize: 'none' }}
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={saving || !isFormValid} style={{ 
                                height: '80px', borderRadius: '24px', background: isFormValid ? '#0F172A' : '#E2E8F0', color: 'white', border: 'none', fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', cursor: isFormValid ? 'pointer' : 'not-allowed', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: isFormValid ? '0 15px 30px rgba(15, 23, 42, 0.25)' : 'none'
                            }}>
                                {saving ? <Loader2 className="animate-spin" size={24} /> : <>Initialize Workspace <ArrowRight size={20} /></>}
                            </button>
                        </form>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
