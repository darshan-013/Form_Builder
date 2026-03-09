import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import FormRenderer from '../../components/FormRenderer';
import { getFormRender, submitForm } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

/**
 * Public Submission Page — /submit/[id]
 *
 * Accessible without authentication.
 * Flow:
 *   1. Load form config (GET /api/forms/:id — public endpoint)
 *   2. Render FormRenderer with real submit enabled
 *   3. FormRenderer validates client-side (required + regex)
 *   4. On valid submit → POST /api/forms/:id/submit
 *   5. Backend validates again (required + regex) then INSERTs into form's table
 *   6. Toast + success screen on response
 */
export default function SubmitPage() {
    const router = useRouter();
    const { id } = router.query;

    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isDraft, setIsDraft] = useState(false);
    const [alreadySubmitted, setAlreadySubmitted] = useState(false);
    const [isExpired, setIsExpired] = useState(false);
    const [submitted, setSubmitted] = useState(false); // shown after successful submit

    useEffect(() => {
        if (!id) return;
        getFormRender(id)
            .then((data) => {
                const formObj = {
                    id:                       data.formId,
                    name:                     data.formName,
                    description:              data.formDescription,
                    allowMultipleSubmissions: data.allowMultipleSubmissions ?? true,
                    showTimestamp:            data.showTimestamp ?? false,
                    fields:                   (data.fields || []).map(f => ({ ...f })),
                };
                setForm(formObj);
                // Client-side expiry check
                if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
                    setIsExpired(true);
                }
                // If single-submission form, check localStorage to block re-entry across tabs
                if (!formObj.allowMultipleSubmissions) {
                    const key = `submitted_${id}`;
                    if (typeof window !== 'undefined' && localStorage.getItem(key)) {
                        setAlreadySubmitted(true);
                    }
                }
            })
            .catch((err) => {
                if (err?.status === 403) setIsDraft(true);
                else if (err?.status === 404) setNotFound(true);
                else if (err?.status === 410) setIsExpired(true);
                else if (err?.status === 409) setAlreadySubmitted(true);
                else toastError('Failed to load form.');
            })
            .finally(() => setLoading(false));
    }, [id]);

    const handleSubmit = async (values) => {
        try {
            await submitForm(id, values);
            // Mark as submitted in localStorage for single-submission forms
            if (form && !form.allowMultipleSubmissions) {
                localStorage.setItem(`submitted_${id}`, '1');
            }
            toastSuccess('Form submitted successfully! 🎉');
            // Show success screen — do NOT redirect, hide the form fields
            setSubmitted(true);
        } catch (err) {
            // 409 = backend says already submitted
            if (err?.status === 409) {
                localStorage.setItem(`submitted_${id}`, '1');
                setAlreadySubmitted(true);
                toastError('You have already submitted this form.');
                return;
            }
            // 410 = form has expired
            if (err?.status === 410) {
                setIsExpired(true);
                toastError('This form has expired.');
                return;
            }
            if (err?.errors && Array.isArray(err.errors) && err.errors.length > 0) {
                const firstErr = err.errors[0];
                const preview  = typeof firstErr === 'object' ? firstErr.message : String(firstErr);
                toastError(preview || 'Please fix the errors and try again.');
            } else {
                toastError(err?.message || 'Submission failed.');
            }
            throw err;
        }
    };

    // ── Loading ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', background: 'var(--bg-base)',
            }}>
                <span className="spinner" style={{ width: 36, height: 36 }} />
            </div>
        );
    }

    // ── Success — form was just submitted ──────────────────────────────────────

    if (submitted) {
        return (
            <>
                <Head><title>Submitted — {form?.name || 'FormCraft'}</title></Head>
                <div className="form-page">
                    <div className="form-page-nav animate-down" style={{ justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, background: 'var(--accent-grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            ⚡ FormCraft
                        </span>
                    </div>
                    <div className="form-renderer-card" style={{ padding: '64px 32px', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
                        {/* Animated checkmark */}
                        <div style={{
                            width: 80, height: 80, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.08))',
                            border: '2px solid rgba(16,185,129,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 24px',
                            boxShadow: '0 0 32px rgba(16,185,129,0.2)',
                            fontSize: 36,
                        }}>
                            ✅
                        </div>
                        <h2 style={{
                            fontFamily: 'Outfit', fontSize: 28, fontWeight: 800,
                            color: 'var(--text-primary)', marginBottom: 12, letterSpacing: '-0.02em',
                        }}>
                            Response Submitted!
                        </h2>
                        <p style={{
                            color: 'var(--text-secondary)', fontSize: 15,
                            maxWidth: 380, margin: '0 auto 28px', lineHeight: 1.6,
                        }}>
                            Your response for <strong style={{ color: 'var(--text-primary)' }}>{form?.name}</strong> has been recorded successfully. Thank you!
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 20px', borderRadius: 20,
                                background: 'rgba(16,185,129,0.12)', color: '#34D399',
                                border: '1px solid rgba(16,185,129,0.28)', fontSize: 13, fontWeight: 700,
                            }}>
                                ✓ Response recorded
                            </span>
                        </div>
                    </div>
                    <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                        Powered by FormCraft
                    </p>
                </div>
            </>
        );
    }

    // ── Already submitted ──────────────────────────────────────────────────────

    if (alreadySubmitted) {
        return (
            <>
                <Head><title>Already Submitted — FormCraft</title></Head>
                <div className="form-page">
                    <div className="form-page-nav animate-down" style={{ justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, background: 'var(--accent-grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚡ FormCraft</span>
                    </div>
                    <div className="form-renderer-card" style={{ padding: '60px 32px', textAlign: 'center' }}>
                        <div style={{ fontSize: 60, marginBottom: 20 }}>✅</div>
                        <h2 style={{ fontFamily: 'Outfit', fontSize: 26, marginBottom: 12, color: 'var(--text-primary)', fontWeight: 800 }}>
                            Already Submitted
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 380, margin: '0 auto 24px' }}>
                            You have already submitted a response for this form. Only one submission per person is allowed.
                        </p>
                        <span style={{
                            display: 'inline-block',
                            padding: '7px 20px', borderRadius: 20,
                            background: 'rgba(16,185,129,0.12)',
                            color: '#34D399',
                            border: '1px solid rgba(16,185,129,0.28)',
                            fontSize: 13, fontWeight: 700,
                        }}>
                            🔒 One response per person
                        </span>
                    </div>
                    <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Powered by FormCraft</p>
                </div>
            </>
        );
    }

    // ── Expired ────────────────────────────────────────────────────────────────

    if (isExpired) {
        return (
            <>
                <Head><title>Form Expired — FormCraft</title></Head>
                <div className="form-page">
                    <div className="form-page-nav animate-down" style={{ justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, background: 'var(--accent-grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚡ FormCraft</span>
                    </div>
                    <div className="form-renderer-card" style={{ padding: '60px 32px', textAlign: 'center' }}>
                        <div style={{ fontSize: 60, marginBottom: 20 }}>⏰</div>
                        <h2 style={{ fontFamily: 'Outfit', fontSize: 26, marginBottom: 12, color: 'var(--text-primary)', fontWeight: 800 }}>
                            Form Expired
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 400, margin: '0 auto 24px' }}>
                            This form is no longer accepting responses. The submission deadline has passed.
                        </p>
                        <span style={{
                            display: 'inline-block', padding: '7px 20px', borderRadius: 20,
                            background: 'rgba(239,68,68,0.12)', color: '#F87171',
                            border: '1px solid rgba(239,68,68,0.28)', fontSize: 13, fontWeight: 700,
                        }}>
                            📅 Submission closed
                        </span>
                    </div>
                    <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Powered by FormCraft</p>
                </div>
            </>
        );
    }

    // ── DRAFT — form not accepting submissions ─────────────────────────────────

    if (isDraft) {
        return (
            <>
                <Head><title>Form Not Available — FormCraft</title></Head>
                <div className="form-page">
                    <div className="form-renderer-card" style={{ padding: '60px 32px', textAlign: 'center' }}>
                        <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
                        <h2 style={{ fontFamily: 'Outfit', fontSize: 24, marginBottom: 12, color: 'var(--text-primary)' }}>
                            Form Not Available
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 380, margin: '0 auto' }}>
                            This form is not currently accepting responses. It may still be a draft or temporarily closed.
                        </p>
                        <div style={{ marginTop: 8 }}>
                            <span style={{
                                display: 'inline-block', marginTop: 20,
                                padding: '6px 18px', borderRadius: 20,
                                background: 'rgba(245,158,11,0.15)',
                                color: '#FCD34D',
                                border: '1px solid rgba(245,158,11,0.3)',
                                fontSize: 13, fontWeight: 600,
                            }}>
                                📝 DRAFT
                            </span>
                        </div>
                    </div>
                    <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                        Powered by FormCraft
                    </p>
                </div>
            </>
        );
    }

    // ── Not found ──────────────────────────────────────────────────────────────

    if (notFound || !form) {
        return (
            <>
                <Head><title>Form Not Found — FormCraft</title></Head>
                <div className="form-page">
                    <div className="form-renderer-card" style={{ padding: '60px 32px', textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                        <h2 style={{ fontFamily: 'Outfit', fontSize: 22, marginBottom: 8 }}>Form Not Found</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                            This form link may be invalid or the form has been deleted.
                        </p>
                    </div>
                </div>
            </>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            <Head>
                <title>{form.name} — FormCraft</title>
                <meta name="description" content={form.description || `Fill out ${form.name}`} />
            </Head>

            <div className="form-page">
                {/* Minimal branding header for public page */}
                <div className="form-page-nav animate-down" style={{ justifyContent: 'center' }}>
                    <span style={{
                        fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
                        background: 'var(--accent-grad)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                        ⚡ FormCraft
                    </span>
                </div>

                {/* Single-submission notice */}
                {!form.allowMultipleSubmissions && (
                    <div style={{
                        maxWidth: 700, margin: '0 auto 14px',
                        padding: '10px 18px', borderRadius: 10,
                        background: 'rgba(245,158,11,0.10)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        color: '#FCD34D', fontSize: 13, fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        🔒 This form allows <strong style={{ marginLeft: 4 }}>one submission per person</strong>.
                    </div>
                )}

                <FormRenderer
                    form={form}
                    isPreview={false}
                    onSubmit={handleSubmit}
                />

                <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Powered by FormCraft • Your response is securely recorded
                </p>
            </div>
        </>
    );
}
