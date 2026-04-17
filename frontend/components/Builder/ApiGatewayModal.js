import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Terminal, Grid, Check, ShieldCheck } from 'lucide-react';
import { toastSuccess } from '../../services/toast';

export default function ApiGatewayModal({ isOpen, onClose, formId, versionId }) {
    const [copied, setCopied] = useState(null);

    if (!isOpen) return null;

    const metadataUrl = `http://localhost:9090/api/v1/forms/${formId}${versionId ? `?versionId=${versionId}` : ''}`;
    const submissionUrl = `http://localhost:9090/api/v1/submissions`;

    const handleCopy = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        toastSuccess(`${type === 'get' ? 'Metadata' : 'Submission'} URL copied!`);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="gateway-overlay">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="gateway-container"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="gateway-header">
                    <div className="header-left">
                        <div className="terminal-icon">
                            <Terminal size={20} color="white" />
                        </div>
                        <div className="header-text">
                            <h3>API GATEWAY</h3>
                            <span>VERSION CONTROL 2.4</span>
                        </div>
                    </div>
                    <button className="close-x" onClick={onClose}>
                        <X size={20} />
                    </button>
                </header>

                <div className="gateway-body">
                    {/* Sync Instructions Card */}
                    <div className="instruction-card">
                        <div className="sync-icon-box">
                            <Grid size={24} color="#3b82f6" />
                        </div>
                        <div className="instruction-content">
                            <h4>Sync Instructions</h4>
                            <p>
                                Use the available APIs to integrate dynamic <span className="highlight">form creation and response handling</span> into your project.
                            </p>
                        </div>
                    </div>

                    {/* Metadata Fetch Section */}
                    <div className="endpoint-section">
                        <div className="section-header">
                            <div className="num-badge">01</div>
                            <h4>METADATA FETCH</h4>
                            <span className="sync-badge">SCHEMA SYNC</span>
                        </div>
                        <div className="code-block">
                            <span className="method-label get">GET</span>
                            <code className="url-text">{metadataUrl}</code>
                            <button 
                                className={`copy-btn ${copied === 'get' ? 'copied' : ''}`}
                                onClick={() => handleCopy(metadataUrl, 'get')}
                            >
                                {copied === 'get' ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Payload Submission Section */}
                    <div className="endpoint-section">
                        <div className="section-header">
                            <div className="num-badge">02</div>
                            <h4>PAYLOAD SUBMISSION</h4>
                        </div>
                        <div className="code-block">
                            <span className="method-label post">POST</span>
                            <code className="url-text">{submissionUrl}</code>
                            <button 
                                className={`copy-btn ${copied === 'post' ? 'copied' : ''}`}
                                onClick={() => handleCopy(submissionUrl, 'post')}
                            >
                                {copied === 'post' ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                <footer className="gateway-footer">
                    <button className="footer-close-btn" onClick={onClose}>
                        CLOSE DOCUMENTATION
                    </button>
                </footer>
            </motion.div>

            <style jsx>{`
                .gateway-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(8px);
                    z-index: 10002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    animation: fadeIn 0.3s ease;
                }
                .gateway-container {
                    background: var(--bg-base);
                    width: 100%;
                    max-width: 720px;
                    border-radius: 48px;
                    overflow: hidden;
                    box-shadow: 
                        0 0 0 1px rgba(0, 0, 0, 0.1),
                        0 40px 120px rgba(0, 0, 0, 0.45),
                        0 0 80px rgba(99, 102, 241, 0.1);
                    display: flex;
                    flex-direction: column;
                    border: 1px solid var(--border);
                }
                .gateway-header {
                    background: linear-gradient(135deg, #1e1b4b 0%, #1e293b 100%);
                    padding: 32px 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: white;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    border-top-left-radius: 48px;
                    border-top-right-radius: 48px;
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .terminal-icon {
                    width: 48px;
                    height: 48px;
                    background: var(--accent-grad);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.2);
                }
                .header-text h3 {
                    margin: 0;
                    font-size: 1.4rem;
                    font-weight: 800;
                    letter-spacing: 0.02em;
                }
                .header-text span {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--accent);
                    letter-spacing: 0.15em;
                }
                .close-x {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: white;
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: var(--transition);
                }
                .close-x:hover { 
                    background: rgba(255, 255, 255, 0.2);
                    transform: rotate(90deg); 
                }
                
                .gateway-body {
                    padding: 40px;
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                    background: var(--bg-surface);
                    flex: 1;
                }
                
                .instruction-card {
                    background: var(--bg-base);
                    border: 1.5px solid var(--border);
                    padding: 24px 32px;
                    border-radius: 36px;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    box-shadow: var(--shadow);
                }
                .sync-icon-box {
                    width: 56px;
                    height: 56px;
                    background: var(--accent-soft);
                    border-radius: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    color: var(--accent);
                }
                .instruction-content h4 {
                    margin: 0 0 4px;
                    font-size: 1.15rem;
                    font-weight: 800;
                    color: var(--text-primary);
                }
                .instruction-content p {
                    margin: 0;
                    font-size: 0.95rem;
                    color: var(--text-secondary);
                    line-height: 1.6;
                }
                .highlight {
                    color: var(--accent);
                    font-weight: 800;
                }
                
                .endpoint-section {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }
                .num-badge {
                    width: 28px;
                    height: 28px;
                    background: var(--text-primary);
                    color: var(--bg-base);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.7rem;
                    font-weight: 900;
                }
                .section-header h4 {
                    margin: 0;
                    font-size: 0.9rem;
                    font-weight: 900;
                    color: var(--text-primary);
                    letter-spacing: 0.05em;
                }
                .sync-badge {
                    background: var(--accent-soft);
                    color: var(--accent);
                    font-size: 0.6rem;
                    font-weight: 900;
                    padding: 5px 14px;
                    border-radius: 30px;
                    letter-spacing: 0.1em;
                    margin-left: auto;
                }
                
                .code-block {
                    background: var(--bg-base);
                    border: 1.5px solid var(--border);
                    border-radius: 24px;
                    padding: 12px 12px 12px 28px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    box-shadow: var(--shadow);
                    transition: var(--transition);
                }
                .code-block:hover {
                    border-color: var(--accent);
                    box-shadow: var(--accent-glow);
                }
                .method-label {
                    font-size: 0.75rem;
                    font-weight: 900;
                    padding: 4px 10px;
                    border-radius: 8px;
                    letter-spacing: 0.05em;
                }
                .method-label.get { background: var(--accent-soft); color: var(--accent); }
                .method-label.post { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                
                .url-text {
                    flex: 1;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    word-break: break-all;
                }
                
                .copy-btn {
                    width: 48px;
                    height: 48px;
                    background: var(--bg-surface);
                    border: 1.5px solid var(--border);
                    border-radius: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-muted);
                    cursor: pointer;
                    transition: var(--transition);
                }
                .copy-btn:hover {
                    background: var(--bg-card-hover);
                    color: var(--text-primary);
                    border-color: var(--accent);
                }
                .copy-btn.copied {
                    background: rgba(16, 185, 129, 0.05);
                    color: #10b981;
                    border-color: #10b981;
                }
                
                .gateway-footer {
                    padding: 32px 48px 48px;
                    display: flex;
                    justify-content: center;
                    background: var(--bg-base);
                    border-top: 1px solid var(--border);
                    border-bottom-left-radius: 48px;
                    border-bottom-right-radius: 48px;
                }
                .footer-close-btn {
                    background: var(--text-primary);
                    color: var(--bg-base);
                    border: none;
                    height: 54px;
                    padding: 0 40px;
                    border-radius: 27px;
                    font-size: 0.9rem;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    cursor: pointer;
                    transition: var(--transition);
                    box-shadow: var(--shadow);
                }
                .footer-close-btn:hover {
                    transform: translateY(-3px) scale(1.02);
                    box-shadow: var(--shadow-lg);
                }
                
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}
