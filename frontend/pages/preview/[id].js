import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Eye, AlertTriangle } from 'lucide-react';
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

            <div className="page" style={{ background: 'var(--bg-base)' }}>
                <Navbar />

                <div className="preview-wrap animate-down">
                    {/* Back + Share nav */}
                    <div className="preview-nav-v2">
                        <Link href={builderHref} className="btn btn-secondary btn-sm" style={{ padding: '8px 16px' }}>
                            <ArrowLeft size={14} /> Back to Builder
                        </Link>
                        
                        <div className="preview-badge">
                            <Eye size={14} />
                            Preview Mode
                        </div>
                    </div>

                    <div className="preview-content">
                        {form ? (
                            <FormRenderer
                                form={form}
                                isPreview={true}
                                onSubmit={() => Promise.resolve()}  // no-op in preview
                            />
                        ) : (
                            <div className="empty-state" style={{ padding: '80px 0' }}>
                                <div className="empty-state-icon">
                                    <AlertTriangle size={48} color=\"var(--error)\" />
                                </div>
                                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, marginTop: 24 }}>Form not found</h3>
                                <p style={{ color: 'var(--text-muted)' }}>This version or form may have been deleted.</p>
                                <Link href=\"/dashboard\" className=\"btn btn-primary\" style={{ marginTop: 24 }}>Return to Dashboard</Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
