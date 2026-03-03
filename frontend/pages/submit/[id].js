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

    useEffect(() => {
        if (!id) return;
        getFormRender(id)
            .then((data) => {
                // Normalise render response to the shape FormRenderer expects:
                // { name, description, fields: [{fieldKey, label, fieldType, required, options, ...}] }
                setForm({
                    id:          data.formId,
                    name:        data.formName,
                    description: data.formDescription,
                    fields:      (data.fields || []).map(f => ({
                        ...f,
                        // options already resolved: [{label, value}]
                    })),
                });
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
            // Redirect to the submissions list for this form
            router.push(`/submissions/${id}`);
        } catch (err) {
            // err.errors is an array of { field: fieldKey, message: string }
            // coming from GlobalExceptionHandler → ValidationErrorResponse
            if (err?.errors && Array.isArray(err.errors) && err.errors.length > 0) {
                // Show a toast with the first error as a summary
                const firstErr = err.errors[0];
                const preview  = typeof firstErr === 'object'
                    ? firstErr.message
                    : String(firstErr);
                toastError(preview || 'Please fix the errors and try again.');
            } else {
                toastError(err?.message || 'Submission failed.');
            }
            throw err; // re-throw so FormRenderer maps errors back to fields
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
