import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import FormRenderer from '../../components/FormRenderer';
import { getFormRenderAdmin, getFormVersions } from '../../services/api';
import { toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

/**
 * Form Preview Page — /preview/[id]
 * Admin view — shows the form exactly as end-users will see it.
 * Uses /render/admin so DRAFT forms are also previewable.
 * Submission is DISABLED (isPreview=true) so no data is written.
 */
export default function PreviewPage() {
    const router = useRouter();
    const { id, versionId } = router.query;
    const { hasRole } = useAuth();

    const isRoleAdmin = hasRole('Role Administrator');
    const isViewer = hasRole('Viewer');

    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const builderHref = id ? `/builder/${id}${versionId ? `?versionId=${versionId}` : ''}` : '/dashboard';

    useEffect(() => {
        if (!id) return;

        const loadPreview = async () => {
            try {
                let resolvedVersionId = versionId || null;

                // If URL has no version id, prefer active version; otherwise fall back to newest version.
                if (!resolvedVersionId) {
                    const versions = await getFormVersions(id);
                    if (Array.isArray(versions) && versions.length > 0) {
                        const activeVersion = versions.find(v => Boolean(v?.isActive));
                        resolvedVersionId = activeVersion?.id || versions[0]?.id || null;
                    }
                }

                const data = await getFormRenderAdmin(id, resolvedVersionId);
                setForm({
                    id: data.formId,
                    name: data.formName,
                    description: data.formDescription,
                    fields: data.fields || [],
                    groups: data.groups || [],
                });
            } catch (err) {
                const isNoActiveVersion = err?.status === 409;
                toastError(isNoActiveVersion ? 'No previewable active version was found for this form.' : 'Failed to load form.');
                setForm(null);
            } finally {
                setLoading(false);
            }
        };

        loadPreview();
    }, [id, versionId]);

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
                        <Link href={builderHref} className="btn btn-secondary btn-sm">
                            ← Back to Builder
                        </Link>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <span className="badge badge-text" style={{ padding: '6px 14px', fontSize: 12 }}>
                                👁 Preview Mode
                            </span>
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
