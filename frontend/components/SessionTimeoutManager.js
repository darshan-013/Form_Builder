import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { onActivity, getMe } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

const SESSION_TIMEOUT_SEC = 15 * 60; // 15 minutes
const WARNING_THRESHOLD_SEC = 60;   // 1 minute

/**
 * SessionTimeoutManager
 * Monitors user activity and shows a warning banner when the session is about to expire.
 * Automatically redirects to the login page when the timer hits zero.
 */
export default function SessionTimeoutManager() {
    const { user, clearAuth } = useAuth();
    const router = useRouter();
    const [timeLeft, setTimeLeft] = useState(SESSION_TIMEOUT_SEC);
    const [isExpiring, setIsExpiring] = useState(false);

    const resetTimer = useCallback(() => {
        setTimeLeft(SESSION_TIMEOUT_SEC);
        setIsExpiring(false);
    }, []);

    useEffect(() => {
        // Only monitor for logged-in users
        if (!user) {
            resetTimer();
            return;
        }

        // Subscribe to activity from api.js (resets on every API call)
        const unsubscribe = onActivity(resetTimer);

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                const next = prev - 1;
                
                // Trigger warning state
                if (next <= WARNING_THRESHOLD_SEC && !isExpiring && next > 0) {
                    setIsExpiring(true);
                }

                // Session expired
                if (next <= 0) {
                    clearInterval(timer);
                    clearAuth();
                    if (typeof window !== 'undefined') {
                        // Using window.location to force a hard refresh and avoid stale state
                        window.location.href = '/login?expired=true';
                    }
                    return 0;
                }
                
                return next;
            });
        }, 1000);

        return () => {
            clearInterval(timer);
            unsubscribe();
        };
    }, [user, resetTimer, isExpiring, clearAuth]);

    const handleExtend = async () => {
        try {
            // Calling getMe() refreshes the server-side session and 
            // the api.js interceptor will call notifyActivity() to reset our client timer.
            await getMe();
        } catch (err) {
            console.error('Failed to extend session', err);
        }
    };

    const handleLogout = () => {
        // Redirect to login (which handles logout cleanup)
        window.location.href = '/login';
    };

    // Don't show anything if user not logged in or timer is still high
    if (!user || timeLeft > WARNING_THRESHOLD_SEC || timeLeft <= 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -80, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 120 }}
                className="session-warning-banner glass-v3"
            >
                <div className="banner-content">
                    <div className="warning-info">
                        <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                        >
                            <AlertTriangle className="warning-icon" size={20} />
                        </motion.div>
                        <span className="warning-text">
                            Security Warning: Session ending in <strong>{timeLeft}s</strong> due to inactivity
                        </span>
                    </div>
                    
                    <div className="banner-actions">
                        <button className="btn-extend" onClick={handleExtend} title="Extend session">
                            <RefreshCw size={14} className="icon-spin-hover" /> 
                            <span>Stay logged in</span>
                        </button>
                        <button className="btn-logout-mini" onClick={handleLogout} title="Logout">
                            <LogOut size={14} /> 
                            <span>Logout</span>
                        </button>
                    </div>
                </div>

                <style jsx>{`
                    .session-warning-banner {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        z-index: 99999;
                        height: 60px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(220, 38, 38, 0.85); /* Vivid Red Glass */
                        color: white;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
                        font-family: 'Inter', system-ui, sans-serif;
                    }

                    .banner-content {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                        max-width: 1400px;
                        padding: 0 32px;
                    }

                    .warning-info {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                    }

                    .warning-icon {
                        color: #fef08a; /* Yellow-400 */
                    }

                    .warning-text {
                        font-size: 0.95rem;
                        font-weight: 500;
                        letter-spacing: -0.01em;
                    }

                    .warning-text strong {
                        font-variant-numeric: tabular-nums;
                        color: #fef08a;
                        font-size: 1.15rem;
                        font-weight: 800;
                        margin: 0 4px;
                        text-shadow: 0 0 10px rgba(254, 240, 138, 0.3);
                    }

                    .banner-actions {
                        display: flex;
                        gap: 12px;
                    }

                    .btn-extend, .btn-logout-mini {
                        background: rgba(255, 255, 255, 0.15);
                        border: 1px solid rgba(255, 255, 255, 0.25);
                        color: white;
                        padding: 8px 18px;
                        border-radius: 10px;
                        font-size: 0.85rem;
                        font-weight: 700;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    }

                    .btn-extend {
                        background: #fff;
                        color: #dc2626;
                        border: none;
                    }

                    .btn-extend:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(255, 255, 255, 0.3);
                        background: #fef2f2;
                    }

                    .btn-logout-mini:hover {
                        background: rgba(255, 255, 255, 0.25);
                        transform: translateY(-2px);
                    }

                    .glass-v3 {
                        backdrop-filter: blur(14px) saturate(180%);
                        -webkit-backdrop-filter: blur(14px) saturate(180%);
                    }

                    @media (max-width: 768px) {
                        .warning-text span { display: none; }
                        .btn-extend span, .btn-logout-mini span { display: none; }
                        .banner-content { padding: 0 16px; }
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
