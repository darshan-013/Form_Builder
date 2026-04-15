import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Eye, AlertTriangle } from 'lucide-react';
import FormRenderer from '../../components/FormRenderer';
import { getFormRenderAdmin, getFormVersions } from '../../services/api';
import { toastError } from '../../services/toast';

/**
 * Form Preview Page — /preview/[id]
 * Isolated from main app sidebar for a true full-page preview.
 */
export default function PreviewPage() {
    const router = useRouter();
    const { id, versionId } = router.query;

    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const builderHref = id ? `/builder/${id}${versionId ? `?versionId=${versionId}` : ''}` : '/dashboard';

    useEffect(() => {
        if (!id) return;

        const loadPreview = async () => {
            try {
                let resolvedVersionId = versionId || null;
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
                    versionId: resolvedVersionId
                });
            } catch (err) {
                console.error('Preview load failed:', err);
                toastError('Could not load form preview.');
            } finally {
                setLoading(false);
            }
        };

        loadPreview();
    }, [id, versionId]);

    return (
        <div className="builder-page prev-full-page" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
            <Head>
                <title>Preview | {form?.name || 'Form'}</title>
            </Head>

            {/* Premium Preview Navigation */}
            <nav className="preview-nav-v2" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
                <Link href={builderHref} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ArrowLeft size={14} /> Back to Builder
                </Link>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="preview-badge">
                        <Eye size={14} /> Preview Mode
                    </div>
                </div>
            </nav>

            <div className="preview-page-content">
                {loading ? (
                    <div style={{ padding: '100px', textAlign: 'center' }}>
                        <div className="sb-spinner" style={{ margin: '0 auto' }}></div>
                        <p style={{ marginTop: '20px', color: 'var(--text-muted)' }}>Preparing preview...</p>
                    </div>
                ) : form ? (
                    <FormRenderer 
                        form={form} 
                        isPreview={true}
                        onSubmit={() => Promise.resolve()} 
                    />
                ) : (
                    <div className="empty-state" style={{ padding: '80px 0' }}>
                        <div className="empty-state-icon">
                            <AlertTriangle size={48} color="var(--error)" />
                        </div>
                        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, marginTop: 24 }}>Form not found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>This version or form may have been deleted.</p>
                        <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: 24 }}>Return to Dashboard</Link>
                    </div>
                )}
            </div>
        </div>
    );
}
