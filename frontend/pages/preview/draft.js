import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Sparkles, ArrowLeft, Download, Eye, AlertCircle } from 'lucide-react';

/**
 * AI Draft Preview Page
 * Loads a schema from sessionStorage and renders it in a "readonly" preview mode.
 * This allows users to see what the AI generated before importing.
 */
export default function AiDraftPreview() {
    const router = useRouter();
    const [schema, setSchema] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const raw = window.sessionStorage.getItem('ai_proposal_preview');
        if (raw) {
            try {
                setSchema(JSON.parse(raw));
            } catch (e) {
                console.error('Failed to parse AI proposal preview', e);
            }
        }
        setLoading(false);
    }, []);

    if (loading) {
        return <div className="loading-center"><span className="spinner" /></div>;
    }

    if (!schema) {
        return (
            <div className="error-container">
                <AlertCircle size={48} color="#ef4444" />
                <h2>No Preview Available</h2>
                <p>We couldn't find an AI proposal to preview. Please return to the builder and try again.</p>
                <button className="btn btn-primary" onClick={() => window.close()}>Close Tab</button>
            </div>
        );
    }

    return (
        <div className="preview-page">
            <Head><title>Preview AI Design — FormCraft</title></Head>

            <div className="preview-banner">
                <div className="banner-content">
                    <Sparkles className="banner-icon" size={20} />
                    <span>This is an <strong>AI-generated proposal</strong>. Close this tab to return and import it.</span>
                </div>
            </div>

            <div className="preview-content-container">
                <div className="preview-header">
                    <div className="preview-title-group">
                        <h1>{schema.name || 'Untitled Form'}</h1>
                        {schema.description && <p className="preview-desc">{schema.description}</p>}
                    </div>
                </div>

                <div className="preview-form-fields">
                    {(schema.fields || []).map((f, i) => (
                        <div key={i} className="preview-field-row">
                            <label className="preview-field-label">
                                {f.label}
                                {f.required && <span className="req-star">*</span>}
                            </label>

                            <div className="preview-field-input-mock">
                                {f.fieldType === 'text' && <div className="mock-input">Text input...</div>}
                                {f.fieldType === 'number' && <div className="mock-input">Number input...</div>}
                                {f.fieldType === 'date' && <div className="mock-input">YYYY-MM-DD</div>}
                                {f.fieldType === 'boolean' && <div className="mock-toggle"></div>}
                                {(f.fieldType === 'dropdown' || f.fieldType === 'radio' || f.fieldType === 'multiple_choice') && (
                                    <div className="mock-options">
                                        <div className="mock-option">○ Option A</div>
                                        <div className="mock-option">○ Option B</div>
                                        <span className="mock-hint">(Options can be configured after import)</span>
                                    </div>
                                )}
                                {f.fieldType === 'file' && <div className="mock-file">📎 Attachment</div>}
                                {f.fieldType === 'section_header' && <h3 className="mock-h">{f.label}</h3>}
                                {f.fieldType === 'description_block' && <p className="mock-p">Description text goes here...</p>}
                            </div>
                        </div>
                    ))}
                </div>

                {(!schema.fields || schema.fields.length === 0) && (
                    <div className="empty-preview">
                        <p>No fields in this proposal.</p>
                    </div>
                )}
            </div>

            <style jsx>{`
                .preview-page {
                    min-height: 100vh;
                    background: #f8fafc;
                    display: flex;
                    flex-direction: column;
                }
                .preview-banner {
                    background: #6366f1;
                    color: white;
                    padding: 8px 16px;
                    display: flex;
                    justify-content: center;
                    font-size: 0.9rem;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .banner-content {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .preview-content-container {
                    max-width: 800px;
                    margin: 40px auto;
                    width: 100%;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    padding: 40px;
                }
                .preview-header {
                    margin-bottom: 32px;
                    border-bottom: 2px solid #f1f5f9;
                    padding-bottom: 24px;
                }
                .preview-title-group h1 {
                    font-size: 1.875rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0 0 8px 0;
                }
                .preview-desc {
                    color: #64748b;
                    font-size: 1.1rem;
                    margin: 0;
                }
                .preview-form-fields {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .preview-field-row {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .preview-field-label {
                    font-weight: 600;
                    color: #334155;
                    font-size: 0.95rem;
                }
                .req-star {
                    color: #ef4444;
                    margin-left: 4px;
                }
                .mock-input {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    padding: 10px 14px;
                    border-radius: 8px;
                    color: #94a3b8;
                    font-size: 0.9rem;
                    height: 42px;
                    display: flex;
                    align-items: center;
                }
                .mock-toggle {
                    width: 44px;
                    height: 24px;
                    background: #e2e8f0;
                    border-radius: 20px;
                    position: relative;
                }
                .mock-toggle::after {
                    content: '';
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    width: 20px;
                    height: 20px;
                    background: white;
                    border-radius: 50%;
                }
                .mock-options {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .mock-option {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                    color: #64748b;
                }
                .mock-hint {
                    font-size: 0.8rem;
                    color: #94a3b8;
                    font-style: italic;
                    margin-top: 4px;
                }
                .mock-file {
                    border: 2px dashed #e2e8f0;
                    border-radius: 8px;
                    padding: 16px;
                    text-align: center;
                    color: #64748b;
                    font-size: 0.9rem;
                }
                .mock-h {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 16px 0 8px 0;
                }
                .mock-p {
                    color: #64748b;
                    line-height: 1.6;
                }
                .loading-center {
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: white;
                }
                .error-container {
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    text-align: center;
                }
            `}</style>
        </div>
    );
}
