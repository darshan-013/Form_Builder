import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { register } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleChange = (e) =>
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.username.trim() || !form.password.trim() || !form.email.trim()) {
            setError('All fields are required.');
            return;
        }
        if (form.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (form.password !== form.confirm) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            await register(form.username, form.password, form.email);
            toastSuccess('Account created! Please sign in.');
            router.push('/login');
        } catch (err) {
            const msg = err.message || 'Registration failed.';
            setError(msg);
            toastError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Register — FormCraft</title>
                <meta name="description" content="Create your FormCraft account" />
            </Head>

            <div className="auth-page">
                <div className="auth-card animate-scale-in">
                    <div className="auth-logo">
                        <div className="auth-logo-icon">✦</div>
                        <h1 className="auth-title">Create Account</h1>
                        <p className="auth-subtitle">Join FormCraft to start building forms</p>
                    </div>

                    {error && (
                        <div className="auth-error">
                            <span>⚠</span> {error}
                        </div>
                    )}

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
                                id="email"
                                name="email"
                                type="email"
                                className="form-input"
                                placeholder=" "
                                value={form.email}
                                onChange={handleChange}
                                autoComplete="email"
                                required
                                spellCheck={false}
                            />
                            <label className="auth-float-label" htmlFor="email">Email</label>
                            <span className="auth-float-left-icon" aria-hidden="true">@</span>
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
                                autoComplete="new-password"
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

                        <div className="auth-float-field" style={{ '--clr': 'var(--text-muted)' }}>
                            <input
                                id="confirm"
                                name="confirm"
                                type={showConfirm ? 'text' : 'password'}
                                className="form-input has-pass-toggle"
                                placeholder=" "
                                value={form.confirm}
                                onChange={handleChange}
                                autoComplete="new-password"
                                required
                            />
                            <label className="auth-float-label" htmlFor="confirm">Confirm Password</label>
                            <span className="auth-float-left-icon" aria-hidden="true">✔</span>
                            <button
                                type="button"
                                className="auth-pass-toggle"
                                onClick={() => setShowConfirm((v) => !v)}
                                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                            >
                                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            id="register-submit-btn"
                            className="btn btn-primary auth-submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="spinner" style={{ borderTopColor: '#fff' }} />
                                    Creating account…
                                </span>
                            ) : (
                                <span>Create Account →</span>
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        Already have an account?{' '}
                        <Link href="/login">Sign in</Link>
                    </div>
                </div>
            </div>
        </>
    );
}
