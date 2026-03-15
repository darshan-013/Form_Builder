import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { login } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Container from '../components/ui/Container';

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

            <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-slate-50 dark:bg-[#020617]">
                {/* Background Glows */}
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full" />
                </div>

                <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="p-8 md:p-10 border-indigo-500/10 dark:border-white/5">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-indigo-500/20">
                                ⚡
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-2 font-display">
                                FormCraft
                            </h1>
                            <p className="text-gray-500 dark:text-gray-400">Sign in to your workspace</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm flex items-center gap-3">
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                            <Input
                                label="Username"
                                id="username"
                                name="username"
                                placeholder="Enter your username"
                                value={form.username}
                                onChange={handleChange}
                                autoComplete="username"
                                autoFocus
                                required
                            />

                            <Input
                                label="Password"
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Enter your password"
                                value={form.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                required
                            />

                            <Button
                                type="submit"
                                id="login-submit-btn"
                                variant="primary"
                                className="w-full py-3"
                                isLoading={loading}
                            >
                                Sign In →
                            </Button>
                        </form>

                        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            Don&apos;t have an account?{' '}
                            <Link href="/register" className="text-indigo-500 hover:text-indigo-600 font-semibold transition-colors">
                                Create one
                            </Link>
                        </div>
                    </Card>
                    
                    <div className="mt-8 text-center">
                        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors uppercase tracking-widest font-bold">
                            ← Back to Home
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
