import { useState, useEffect, useCallback } from 'react';

/**
 * LocalToast Component
 * 
 * Provides a native, glassmorphism-styled toast system.
 * Polyfills window.butterup to maintain compatibility with existing service calls.
 */
export default function LocalToast() {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback(({ title, message, type, location, dismissable }) => {
        const id = Date.now() + Math.random();
        const newToast = { id, title, message, type: type || 'info', dismissable: dismissable !== false };
        
        setToasts(prev => [...prev, newToast]);

        // Auto-dismiss after 3.5 seconds
        setTimeout(() => removeToast(id), 3500);
        
        return id;
    }, [removeToast]);

    useEffect(() => {
        // Polyfill window.butterup
        window.butterup = {
            toast: (options) => addToast(options)
        };
        
        return () => {
            delete window.butterup;
        };
    }, [addToast]);

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container shadow-v4">
            {toasts.map(t => (
                <div key={t.id} className={`toast-item ${t.type} glass-v3`}>
                    <div className="toast-content">
                        {t.title && <div className="toast-title">{t.title}</div>}
                        <div className="toast-message">{t.message}</div>
                    </div>
                    {t.dismissable && (
                        <button className="toast-close" onClick={() => removeToast(t.id)}>✕</button>
                    )}
                </div>
            ))}

            <style jsx>{`
                .toast-container {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: none;
                }

                .toast-item {
                    pointer-events: auto;
                    min-width: 300px;
                    max-width: 450px;
                    padding: 16px 20px;
                    border-radius: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1), fadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) 3.2s forwards;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                }

                @keyframes slideIn {
                    from { transform: translateX(30px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                @keyframes fadeOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(30px); opacity: 0; }
                }

                .toast-content {
                    flex: 1;
                }

                .toast-title {
                    font-weight: 800;
                    font-size: 0.9rem;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .toast-message {
                    font-size: 0.95rem;
                    line-height: 1.4;
                    opacity: 0.9;
                }

                .toast-close {
                    background: none;
                    border: none;
                    color: inherit;
                    cursor: pointer;
                    font-size: 1rem;
                    opacity: 0.5;
                    padding: 2px;
                    line-height: 1;
                    transition: opacity 0.2s;
                }

                .toast-close:hover {
                    opacity: 1;
                }

                /* Type Styles */
                .success {
                    background: rgba(16, 185, 129, 0.15);
                    border-left: 4px solid #10b981;
                    color: #d1fae5;
                }
                .success .toast-title { color: #10b981; }

                .error {
                    background: rgba(239, 68, 68, 0.15);
                    border-left: 4px solid #ef4444;
                    color: #fee2e2;
                }
                .error .toast-title { color: #ef4444; }

                .warning {
                    background: rgba(245, 158, 11, 0.15);
                    border-left: 4px solid #f59e0b;
                    color: #fef3c7;
                }
                .warning .toast-title { color: #f59e0b; }

                .info {
                    background: rgba(59, 130, 246, 0.15);
                    border-left: 4px solid #3b82f6;
                    color: #dbeafe;
                }
                .info .toast-title { color: #3b82f6; }

                /* Glassmorphism helpers if needed (vivid dark) */
                .glass-v3 {
                    backdrop-filter: blur(12px) saturate(180%);
                    -webkit-backdrop-filter: blur(12px) saturate(180%);
                }

                /* Light theme adjustments */
                :global([data-theme="light"]) .toast-item {
                    background: rgba(255, 255, 255, 0.8);
                    border: 1px solid rgba(0, 0, 0, 0.1);
                    color: #1f2937;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
                }

                :global([data-theme="light"]) .success {
                    background: rgba(16, 185, 129, 0.1);
                    color: #065f46;
                }
                :global([data-theme="light"]) .error {
                    background: rgba(239, 68, 68, 0.1);
                    color: #991b1b;
                }
                :global([data-theme="light"]) .warning {
                    background: rgba(245, 158, 11, 0.1);
                    color: #92400e;
                }
                :global([data-theme="light"]) .info {
                    background: rgba(59, 130, 246, 0.1);
                    color: #1e40af;
                }
            `}</style>
        </div>
    );
}
