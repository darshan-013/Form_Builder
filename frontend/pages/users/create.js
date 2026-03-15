import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

import { createUser, getRoles, assignRoleToUser } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

export default function CreateUserPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [username, setUsername] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState(null);
    const [allRoles, setAllRoles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace('/login'); return; }
        loadRoles();
    }, [authLoading, user, router]);

    async function loadRoles() {
        try {
            const data = await getRoles();
            setAllRoles(Array.isArray(data) ? data : []);
        } catch {
            toastError('Failed to load roles.');
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!username.trim()) {
            setError('Username is required. Must match an existing registered account.');
            return;
        }

        if (!selectedRoleId) {
            setError('Please select one role. A user can have only one role.');
            return;
        }

        setSaving(true);
        try {
            // Step 1: Create the RBAC user profile
            const createdUser = await createUser(username.trim(), name.trim() || null, email.trim() || null);

            // Step 2: Assign exactly one role
            await assignRoleToUser(createdUser.id, selectedRoleId);

            toastSuccess(`User "${name.trim() || username.trim()}" created successfully.`);
            router.push('/users');
        } catch (err) {
            const msg = err.message || 'Failed to create user.';
            setError(msg);
            toastError(msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Head>
                <title>Create User — FormCraft</title>
            </Head>


            <div className="users-page">
                <div className="users-page-header">
                    <div>
                        <h1>Create New User</h1>
                        <p>Create an RBAC profile and assign roles</p>
                    </div>
                    <Link href="/users" className="btn btn-secondary">
                        ← Back to Users
                    </Link>
                </div>

                <div className="user-form-card">
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

                        {/* Username */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label" htmlFor="username">
                                Username *
                            </label>
                            <input
                                id="username"
                                type="text"
                                className="form-input"
                                placeholder="Enter a unique username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                autoFocus
                                maxLength={100}
                            />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Creates a new user profile. The user will need to register via /register to set their password.
                            </span>
                        </div>

                        {/* Display Name */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label" htmlFor="name">
                                Display Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                className="form-input"
                                placeholder="e.g. John Doe"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        {/* Email */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label" htmlFor="email">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                placeholder="e.g. john@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                maxLength={150}
                            />
                        </div>

                        {/* Role Assignment */}
                        {allRoles.length > 0 && (
                            <div className="role-assign-section">
                                <h3>Assign Role</h3>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>
                                    {selectedRoleId ? '1 role selected' : 'Select exactly one role'}
                                </span>
                                <div className="role-assign-grid">
                                    {allRoles.map(role => (
                                        <label
                                            key={role.id}
                                            className={`role-assign-item ${selectedRoleId === role.id ? 'assigned' : ''}`}
                                        >
                                            <input
                                                type="radio"
                                                name="roleSelection"
                                                checked={selectedRoleId === role.id}
                                                onChange={() => setSelectedRoleId(role.id)}
                                            />
                                            <div className="role-assign-label">
                                                <span className="role-assign-name">
                                                    {role.isSystemRole ? '🔒' : '⚙️'} {role.roleName}
                                                </span>
                                                <span className="role-assign-type">
                                                    {role.isSystemRole ? 'System' : 'Custom'} · {(role.permissions || []).length} permissions
                                                </span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="user-form-actions">
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={saving}
                            >
                                {saving ? 'Creating...' : '✓ Create User'}
                            </button>
                            <Link href="/users" className="btn btn-secondary">
                                Cancel
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
