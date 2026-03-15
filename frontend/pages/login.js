import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { login } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const router = useRouter();
    const { refreshAuth } = useAuth();
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) =>
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.username.trim() || !form.password.trim()) {
            setError('Username and password are required.');
            return;
        }

        setLoading(true);
        try {
            await login(form.username, form.password);
            // Refresh auth context to populate permissions globally
            await refreshAuth();
            toastSuccess('Welcome back!');
            router.push('/dashboard');
        } catch (err) {
            const msg = err.status === 401
                ? 'Invalid username or password.'
                : err.message || 'Login failed. Please try again.';
            setError(msg);
            toastError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Login — FormCraft</title>
                <meta name="description" content="Sign in to FormCraft — Dynamic Form Builder" />
            </Head>

            <div className="auth-page">
                <div className="auth-card animate-in">
                    {/* Brand */}
                    <div className="auth-logo">
                        <div className="auth-logo-icon">⚡</div>
                        <h1 className="auth-title">FormCraft</h1>
                        <p className="auth-subtitle">Sign in to your workspace</p>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className="auth-error">
                            <span>⚠</span> {error}
                        </div>
                    )}

                    {/* Form */}
                    <form className="auth-form" onSubmit={handleSubmit} noValidate>
                        <div className="form-group">
                            <label className="form-label" htmlFor="username">Username</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                className="form-input"
                                placeholder="Enter your username"
                                value={form.username}
                                onChange={handleChange}
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                className="form-input"
                                placeholder="Enter your password"
                                value={form.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                            />
                        </div>

                        <button
                            type="submit"
                            id="login-submit-btn"
                            className="btn btn-primary auth-submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="spinner" style={{ borderTopColor: '#fff' }} />
                                    Signing in…
                                </span>
                            ) : (
                                <span>Sign In →</span>
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        Don&apos;t have an account?{' '}
                        <Link href="/register">Create one</Link>
                    </div>
                </div>
            </div>
        </>
    );
}
