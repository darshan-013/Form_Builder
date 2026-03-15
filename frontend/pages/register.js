import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { register } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

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

            <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-slate-50 dark:bg-[#020617]">
                {/* Background Glows */}
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full" />
                </div>

                <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="p-8 md:p-10 border-indigo-500/10 dark:border-white/5">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-purple-500/10 text-purple-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-purple-500/20">
                                ✦
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-2 font-display">
                                Create Account
                            </h1>
                            <p className="text-gray-500 dark:text-gray-400">Join FormCraft to start building forms</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm flex items-center gap-3">
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                            <Input
                                label="Username"
                                id="username"
                                name="username"
                                placeholder="Choose a username"
                                value={form.username}
                                onChange={handleChange}
                                autoComplete="username"
                                autoFocus
                                required
                            />

                            <Input
                                label="Email"
                                id="email"
                                name="email"
                                type="email"
                                placeholder="your@email.com"
                                value={form.email}
                                onChange={handleChange}
                                autoComplete="email"
                                required
                            />

                            <Input
                                label="Password"
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Min. 6 characters"
                                value={form.password}
                                onChange={handleChange}
                                autoComplete="new-password"
                                required
                            />

                            <Input
                                label="Confirm Password"
                                id="confirm"
                                name="confirm"
                                type="password"
                                placeholder="Re-enter your password"
                                value={form.confirm}
                                onChange={handleChange}
                                autoComplete="new-password"
                                required
                            />

                            <Button
                                type="submit"
                                id="register-submit-btn"
                                variant="primary"
                                className="w-full py-3 mt-4"
                                isLoading={loading}
                            >
                                Create Account →
                            </Button>
                        </form>

                        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            Already have an account?{' '}
                            <Link href="/login" className="text-indigo-500 hover:text-indigo-600 font-semibold transition-colors">
                                Sign in
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
