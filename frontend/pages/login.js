import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles, ArrowRight, User, Lock, Info } from 'lucide-react';
import { login } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SpotlightCard from '../components/landing/SpotlightCard';

const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: { 
        opacity: 1, y: 0, 
        transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } 
    }
};

const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.1
        }
    }
};

export default function LoginPage() {
    const router = useRouter();
    const { refreshAuth } = useAuth();
    const { theme, toggleTheme } = useTheme();
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
                <meta name="description" content="Sign in to FormCraft — Premium Form Builder" />
            </Head>

            <div className="auth-page landing-grid-lines" style={{
                background: theme === 'dark' ? 'var(--bg-base)' : '#f8fafe',
                '--pattern-color': theme === 'dark' ? 'rgba(139, 92, 246, 0.03)' : 'rgba(124, 58, 237, 0.06)',
                '--pattern-size': '32px',
                minHeight: '100vh',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                overflow: 'hidden'
            }}>
                {/* Theme Toggle (Top Right) */}
                <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 100 }}>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="theme-toggle-btn"
                        onClick={(e) => toggleTheme(e)}
                        style={{ 
                            width: '44px', height: '44px', borderRadius: '50%', 
                            background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                            border: '1px solid var(--border)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
                        }}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </motion.button>
                </div>

                {/* Background Glows (Refined) */}
                <div aria-hidden style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                    background: 'var(--accent-grad)', zIndex: 10, opacity: 0.8
                }} />
                
                <div aria-hidden className="landing-float-slow" style={{
                    position: 'absolute', left: '50%', top: '15%', transform: 'translateX(-50%)',
                    width: '500px', height: '350px', borderRadius: '50%',
                    background: theme === 'dark' 
                        ? 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)'
                        : 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
                    filter: 'blur(30px)', pointerEvents: 'none'
                }} />

                <motion.div 
                    initial={{ opacity: 0, scale: 0.98, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    style={{ width: '100%', maxWidth: '440px', zIndex: 1, position: 'relative' }}
                    className="auth-card-outer"
                >
                    {/* Glass Layer with Backdrop-blur (Separated from text for clarity) */}
                    <div style={{
                        position: 'absolute', inset: 0, 
                        borderRadius: '28px',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        background: `rgba(var(--bg-card-rgb), ${theme === 'dark' ? 0.7 : 0.85})`,
                        border: '1px solid var(--border)',
                        zIndex: 0, pointerEvents: 'none'
                    }} />

                    <SpotlightCard 
                        spotlightColor={theme === 'dark' ? "rgba(139, 92, 246, 0.1)" : "rgba(124, 58, 237, 0.08)"}
                        className="auth-card-v4"
                        contentStyle={{ transform: 'none' }} // Disable 3D depth to fix font blur
                        style={{ 
                            background: 'transparent',
                            borderRadius: '28px',
                            boxShadow: theme === 'dark' 
                                ? '0 30px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' 
                                : '0 20px 40px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.5)'
                        }}
                    >
                        <div style={{ padding: '44px 36px', position: 'relative', zIndex: 1, WebkitFontSmoothing: 'antialiased' }}>
                            {/* Brand */}
                            <motion.div className="auth-logo" variants={staggerContainer} initial="hidden" animate="show">
                                <motion.div variants={fadeUp} className="auth-logo-icon" style={{ 
                                    width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 24px',
                                    background: 'var(--accent-grad)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 10px 32px rgba(139, 92, 246, 0.35)'
                                }}>
                                    <Sparkles size={30} color="#fff" />
                                </motion.div>
                                <motion.h1 variants={fadeUp} className="auth-title" style={{ 
                                    fontFamily: 'Outfit, sans-serif', fontSize: '34px', fontWeight: 800, 
                                    letterSpacing: '-0.035em', marginBottom: '10px', textAlign: 'center',
                                    color: 'var(--text-primary)'
                                }}>
                                    Welcome back
                                </motion.h1>
                                <motion.p variants={fadeUp} className="auth-subtitle" style={{ 
                                    color: 'var(--text-secondary)', textAlign: 'center', fontSize: '15px'
                                }}>
                                    Enter your credentials to access your workspace
                                </motion.p>
                            </motion.div>

                            {/* Error banner */}
                            {error && (
                                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="auth-error" style={{ 
                                    marginTop: '24px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.15)', color: theme === 'dark' ? '#fca5a5' : '#ef4444', 
                                    padding: '12px 16px', fontSize: '13px', fontWeight: 500
                                }}>
                                    <span>⚠</span> {error}
                                </motion.div>
                            )}

                            {/* Form */}
                            <motion.form 
                                variants={staggerContainer} initial="hidden" animate="show"
                                className="auth-form" onSubmit={handleSubmit} noValidate style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}
                            >
                                <motion.div variants={fadeUp} className="auth-float-field">
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
                                        style={{ 
                                            width: '100%', height: '56px', padding: '0 52px 0 60px', borderRadius: '14px', 
                                            background: 'var(--bg-input)', border: '1px solid var(--border)', fontSize: '16px',
                                            color: 'var(--text-primary)'
                                        }}
                                    />
                                    <label className="auth-float-label" htmlFor="username" style={{ left: '60px', color: 'var(--text-muted)' }}>Username</label>
                                    <span className="auth-float-left-icon" style={{ left: '22px', color: 'var(--accent)' }}><User size={18} /></span>
                                    <div className="auth-float-right" style={{ right: '16px', color: 'var(--text-muted)' }}>
                                        <Info size={16} />
                                    </div>
                                </motion.div>

                                <motion.div variants={fadeUp} className="auth-float-field" style={{ position: 'relative' }}>
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
                                        style={{ 
                                            width: '100%', height: '56px', padding: '0 52px 0 60px', borderRadius: '14px', 
                                            background: 'var(--bg-input)', border: '1px solid var(--border)', fontSize: '16px',
                                            color: 'var(--text-primary)'
                                        }}
                                    />
                                    <label className="auth-float-label" htmlFor="password" style={{ left: '60px', color: 'var(--text-muted)' }}>Password</label>
                                    <span className="auth-float-left-icon" style={{ left: '22px', color: 'var(--accent)' }}><Lock size={18} /></span>
                                    <button
                                        type="button"
                                        className="auth-pass-toggle"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        style={{ right: '16px', top: '50%', transform: 'translateY(-50%)', position: 'absolute', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </motion.div>

                                <motion.button
                                    variants={fadeUp}
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    id="login-submit-btn"
                                    className="btn btn-primary auth-submit"
                                    disabled={loading}
                                    style={{ 
                                        height: '56px', borderRadius: '14px', background: 'var(--accent-grad)', color: '#fff', 
                                        fontWeight: 700, fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                        boxShadow: '0 8px 30px rgba(139, 92, 246, 0.4)', border: 'none', cursor: 'pointer', marginTop: '12px',
                                        transition: 'var(--transition)'
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner" style={{ borderTopColor: '#fff', width: '20px', height: '20px' }} />
                                            Signing in…
                                        </>
                                    ) : (
                                        <>
                                            Sign In
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </motion.button>
                            </motion.form>

                            <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.6 }} className="auth-footer" style={{ textAlign: 'center', marginTop: '36px', fontSize: '14px', color: 'var(--text-muted)' }}>
                                Don&apos;t have an account?{' '}
                                <Link href="/register" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Create one</Link>
                            </motion.div>
                        </div>
                    </SpotlightCard>
                </motion.div>
            </div>
        </>
    );
}
