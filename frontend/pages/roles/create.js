import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

import PermissionCheckboxGroups from '../../components/PermissionCheckboxGroups';
import { createRole } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

export default function CreateRolePage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [name, setName] = useState('');
    const [permissions, setPermissions] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!user) router.replace('/login');
    }, [authLoading, user, router]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        // Client-side validation
        if (!name.trim()) {
            setError('Role name is required.');
            return;
        }
        if (permissions.length === 0) {
            setError('Select at least one permission.');
            return;
        }

        setSaving(true);
        try {
            await createRole(name.trim(), permissions);
            toastSuccess(`Role "${name.trim()}" created successfully.`);
            router.push('/roles');
        } catch (err) {
            const msg = err.message || 'Failed to create role.';
            setError(msg);
            toastError(msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Head>
                <title>Create Role — FormCraft</title>
            </Head>


            <div className="roles-page">
                <div className="roles-page-header">
                    <div>
                        <h1>Create New Role</h1>
                        <p>Define a custom role with specific permissions</p>
                    </div>
                    <Link href="/roles" className="btn btn-secondary">
                        ← Back to Roles
                    </Link>
                </div>

                <div className="role-form-card">
                    <form onSubmit={handleSubmit}>
                        {/* Error Banner */}
                        {error && (
                            <div style={{
                                padding: '12px 16px', marginBottom: 20,
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                borderRadius: 'var(--radius-sm)',
                                color: '#FCA5A5', fontSize: 14
                            }}>
                                ⚠ {error}
                            </div>
                        )}

                        {/* Role Name */}
                        <div className="form-group" style={{ marginBottom: 24 }}>
                            <label className="form-label" htmlFor="role-name">
                                Role Name *
                            </label>
                            <input
                                id="role-name"
                                type="text"
                                className="form-input"
                                placeholder="e.g. Regional Auditor, Finance Reviewer..."
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                maxLength={100}
                            />
                        </div>

                        {/* Permissions */}
                        <div className="form-group">
                            <label className="form-label">
                                Permissions *
                            </label>
                            <PermissionCheckboxGroups
                                selected={permissions}
                                onChange={setPermissions}
                            />
                        </div>

                        {/* Actions */}
                        <div className="role-form-actions">
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={saving}
                            >
                                {saving ? 'Creating...' : '✓ Create Role'}
                            </button>
                            <Link href="/roles" className="btn btn-secondary">
                                Cancel
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
