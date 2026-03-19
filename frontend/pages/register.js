import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { register } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

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
                        <div className="form-group">
                            <label className="form-label" htmlFor="username">Username</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                className="form-input"
                                placeholder="Choose a username"
                                value={form.username}
                                onChange={handleChange}
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="email">Email</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                className="form-input"
                                placeholder="your@email.com"
                                value={form.email}
                                onChange={handleChange}
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                className="form-input"
                                placeholder="Min. 6 characters"
                                value={form.password}
                                onChange={handleChange}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="confirm">Confirm Password</label>
                            <input
                                id="confirm"
                                name="confirm"
                                type="password"
                                className="form-input"
                                placeholder="Re-enter your password"
                                value={form.confirm}
                                onChange={handleChange}
                                autoComplete="new-password"
                            />
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
