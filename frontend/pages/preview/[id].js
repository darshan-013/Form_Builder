import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import FormRenderer from '../../components/FormRenderer';
import { getFormRenderAdmin } from '../../services/api';
import { toastError } from '../../services/toast';

/**
 * Form Preview Page — /preview/[id]
 * Admin view — shows the form exactly as end-users will see it.
 * Uses /render/admin so DRAFT forms are also previewable.
 * Submission is DISABLED (isPreview=true) so no data is written.
 */
export default function PreviewPage() {
    const router = useRouter();
    const { id } = router.query;

    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        getFormRenderAdmin(id)
            .then((data) => {
                setForm({
                    id: data.formId,
                    name: data.formName,
                    description: data.formDescription,
                    fields: data.fields || [],
                    groups: data.groups || [],
                });
            })
            .catch(() => toastError('Failed to load form.'))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
                <span className="spinner" style={{ width: 36, height: 36 }} />
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{form?.name ? `Preview — ${form.name}` : 'Preview — FormCraft'}</title>
            </Head>

            <div className="page">
                <Navbar />

                <div className="form-page">
                    {/* Back + Share nav */}
                    <div className="form-page-nav animate-down">
                        <Link href={`/builder/${id}`} className="btn btn-secondary btn-sm">
                            ← Edit Form
                        </Link>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <span className="badge badge-text" style={{ padding: '6px 14px', fontSize: 12 }}>
                                👁 Preview Mode
                            </span>
                            <Link href={`/submit/${id}`} className="btn btn-primary btn-sm">
                                Open Submission Link ↗
                            </Link>
                        </div>
                    </div>

                    {form ? (
                        <FormRenderer
                            form={form}
                            isPreview={true}
                            onSubmit={() => Promise.resolve()}  // no-op in preview
                        />
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">⚠</div>
                            <h3>Form not found</h3>
                            <p>This form may have been deleted.</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
