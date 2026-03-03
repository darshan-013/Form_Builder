import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import FormRenderer from '../../components/FormRenderer';
import { getForm, submitForm } from '../../services/api';
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

    useEffect(() => {
        if (!id) return;
        getForm(id)
            .then((data) => {
                console.log('Submit - Form loaded:', data);
                console.log('Submit - Fields:', data?.fields);
                // Log dropdown/radio fields specifically
                data?.fields?.forEach(f => {
                    if (f.fieldType === 'dropdown' || f.fieldType === 'radio') {
                        console.log(`${f.fieldType} field "${f.label}":`, f.optionsJson);
                    }
                });
                setForm(data);
            })
            .catch((err) => {
                if (err.status === 404) setNotFound(true);
                else toastError('Failed to load form.');
            })
            .finally(() => setLoading(false));
    }, [id]);

    /**
     * Called by FormRenderer after client-side validation passes.
     * Sends data to backend; backend validates again (server-side enforcement).
     */
    const handleSubmit = async (values) => {
        try {
            await submitForm(id, values);
            toastSuccess('Form submitted successfully! 🎉');
            // FormRenderer will show its own success state after this resolves
        } catch (err) {
            // Backend validation errors or server errors
            const msg = err.errors?.join(' · ') || err.message || 'Submission failed.';
            toastError(msg);
            throw err; // re-throw so FormRenderer stays in submitting=false state
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
