import { useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { clearSchemaDriftReport, readSchemaDriftReport } from '../services/api';

export default function SchemaDriftPage() {
    const router = useRouter();

    const drift = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return readSchemaDriftReport();
    }, []);

    const mismatchRows = Array.isArray(drift?.errors) ? drift.errors : [];

    const handleClose = () => {
        clearSchemaDriftReport();
        router.push('/dashboard');
    };

    return (
        <>
            <Head>
                <title>Schema Drift Detected - FormCraft</title>
            </Head>

            <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '34px 20px' }}>
                <div style={{ maxWidth: 980, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Schema Drift Detected</h1>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-secondary" onClick={handleClose}>Close</button>
                            <Link className="btn btn-primary" href="/dashboard">Dashboard</Link>
                        </div>
                    </div>

                    <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                        Publish and submit are blocked only for the affected form until database schema and form metadata match.
                    </p>

                    {!drift ? (
                        <div style={{
                            marginTop: 20,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: 18
                        }}>
                            No drift report is available in this browser session.
                        </div>
                    ) : (
                        <>
                            <div style={{
                                marginTop: 20,
                                background: 'var(--bg-card)',
                                border: '1px solid rgba(239,68,68,0.35)',
                                borderRadius: 12,
                                padding: 18
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 8, columnGap: 12, fontSize: 14 }}>
                                    <strong>Source</strong><span>{drift.source || '-'}</span>
                                    <strong>Action</strong><span>{drift.action || '-'}</span>
                                    <strong>Form ID</strong><span>{drift.formId || '-'}</span>
                                    <strong>Version ID</strong><span>{drift.versionId || drift?.details?.versionId || '-'}</span>
                                    <strong>Error Code</strong><span>{drift.errorCode || '-'}</span>
                                    <strong>Message</strong><span>{drift.message || 'Schema drift detected'}</span>
                                </div>
                            </div>

                            <div style={{ marginTop: 20 }}>
                                <h3 style={{ margin: '0 0 10px 0' }}>Exact Mismatch Details</h3>
                                {mismatchRows.length === 0 ? (
                                    <div style={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 12,
                                        padding: 16,
                                        color: 'var(--text-secondary)'
                                    }}>
                                        No field-level mismatch entries were returned by backend.
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left', padding: 12, borderBottom: '1px solid var(--border)' }}>Field / Column</th>
                                                    <th style={{ textAlign: 'left', padding: 12, borderBottom: '1px solid var(--border)' }}>Mismatch</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mismatchRows.map((row, index) => (
                                                    <tr key={`${row?.field || 'row'}-${index}`}>
                                                        <td style={{ padding: 12, borderBottom: '1px solid var(--border)', fontFamily: 'monospace' }}>{row?.field || '-'}</td>
                                                        <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{row?.message || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

