import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { login } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const router = useRouter();
    const { refreshAuth } = useAuth();
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [sessionExpiredShown, setSessionExpiredShown] = useState(false);

    // Check for expired session on mount
    useEffect(() => {
        if (router.query.expired === 'true' && !sessionExpiredShown) {
            const message = 'Your session has expired. Please log in again.';
            setError(message);
            toastError(message);
            setSessionExpiredShown(true);
            // Remove the expired query param from URL
            router.replace('/login', undefined, { shallow: true });
        }
    }, [router.query.expired, sessionExpiredShown, router]);

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
                <div className="auth-card animate-scale-in">
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
                        <div className="auth-float-field" style={{ '--clr': 'var(--text-muted)' }}>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                className="form-input"
                                placeholder=" "
                                value={form.username}
                                onChange={handleChange}
                                autoComplete="username"
                                autoFocus
                                required
                                spellCheck={false}
                            />
                            <label className="auth-float-label" htmlFor="username">Username</label>
                            <span className="auth-float-left-icon" aria-hidden="true">👤</span>
                            <div className="auth-float-right" aria-hidden="true">
                                <span>ℹ</span>
                                <span className="auth-float-tip">Required</span>
                            </div>
                        </div>

                        <div className="auth-float-field" style={{ '--clr': 'var(--text-muted)' }}>
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                className="form-input has-pass-toggle"
                                placeholder=" "
                                value={form.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                required
                            />
                            <label className="auth-float-label" htmlFor="password">Password</label>
                            <span className="auth-float-left-icon" aria-hidden="true">🔒</span>
                            <button
                                type="button"
                                className="auth-pass-toggle"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
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
