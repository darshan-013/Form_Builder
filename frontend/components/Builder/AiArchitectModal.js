import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, X, ChevronRight, Eye, Download, Info, CheckCircle2, Terminal, Cpu, Layout as LayoutIcon, MessageSquare } from 'lucide-react';
import { chatWithAi } from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';

const THINKING_MESSAGES = [
    "Analyzing form requirements...",
    "Architecting initial structure...",
    "Configuring validation logic...",
    "Polishing the user interface...",
    "Finalizing form architecture...",
    "Almost there, making it perfect..."
];

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.98 },
    show: { 
        opacity: 1, 
        y: 0, 
        scale: 1,
        transition: { type: 'spring', stiffness: 260, damping: 20 }
    }
};

export default function AiArchitectModal({ isOpen, onClose, onImport }) {
    const [messages, setMessages] = useState([
        { role: 'ai', content: "Hello! I am your AI Architect. Describe the form you want to build (e.g., 'A leave application with manager approval and date range'), and I'll design it for you in seconds." }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [thinkingIdx, setThinkingIdx] = useState(0);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            const scrollHeight = scrollRef.current.scrollHeight;
            scrollRef.current.scrollTo({
                top: scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, loading]);

    useEffect(() => {
        let timer;
        if (loading) {
            timer = setInterval(() => {
                setThinkingIdx(prev => (prev + 1) % THINKING_MESSAGES.length);
            }, 2500);
        } else {
            setThinkingIdx(0);
        }
        return () => clearInterval(timer);
    }, [loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const history = messages.slice(-10).map(m => ({
                role: m.role === 'ai' ? 'assistant' : 'user',
                content: m.content
            }));

            const res = await chatWithAi(userMsg, history);
            
            setMessages(prev => [...prev, { 
                role: 'ai', 
                content: res.conversational || "I've designed the form for you.", 
                schema: res.schema 
            }]);
        } catch (err) {
            toastError("I'm having trouble connecting to my architecture engine.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = (schema) => {
        if (!schema) return;
        onImport(schema);
        onClose();
    };

    const handlePreview = (schema) => {
        if (!schema) return;
        window.sessionStorage.setItem('ai_proposal_preview', JSON.stringify(schema));
        window.open('/preview/draft', '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="ai-overlay">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 40 }}
                className="ai-studio-container"
                onClick={(e) => e.stopPropagation()}
                layout
            >
                <header className="ai-studio-header">
                    <div className="header-left">
                        <motion.div 
                            initial={{ rotate: -20, scale: 0.8 }}
                            animate={{ rotate: 0, scale: 1 }}
                            className="studio-spark-box"
                        >
                            <Sparkles size={24} color="white" />
                        </motion.div>
                        <div className="header-text">
                            <h3>AI ARCHITECT</h3>
                            <span className="studio-brand">ARCHITECTURE STUDIO 2.4</span>
                        </div>
                    </div>
                    <button className="studio-close-btn" onClick={onClose} aria-label="Close Studio">
                        <X size={20} />
                    </button>
                </header>

                <div className="ai-studio-body" ref={scrollRef}>
                    <motion.div 
                        className="studio-flow"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                    >
                        <AnimatePresence mode="popLayout">
                            {messages.map((m, i) => (
                                <motion.div 
                                    key={i} 
                                    variants={itemVariants}
                                    className={`studio-row ${m.role}`}
                                    layout
                                >
                                    <div className="studio-bubble">
                                        <p>{m.content}</p>
                                        
                                        {m.schema && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.4 }}
                                                className="studio-proposal-card"
                                            >
                                                <div className="proposal-badge-row">
                                                    <div className="studio-num">01</div>
                                                    <span className="proposal-title">SYSTEM PROPOSAL</span>
                                                    <span className="studio-sync-badge">SCHEMA SYNC</span>
                                                </div>
                                                
                                                <div className="proposal-meta">
                                                    <div className="meta-tag">
                                                        <LayoutIcon size={14} />
                                                        {m.schema.fields?.length || 0} Dynamic Anchors Identified
                                                    </div>
                                                </div>

                                                <div className="studio-schema-list">
                                                    {m.schema.fields?.slice(0, 5).map((f, fi) => (
                                                        <div key={fi} className="schema-row">
                                                            <span className="s-label">{f.label}</span>
                                                            <span className="s-type">{f.fieldType}</span>
                                                        </div>
                                                    ))}
                                                    {(m.schema.fields?.length > 5) && (
                                                        <div className="schema-more">
                                                            +{m.schema.fields.length - 5} additional architectural nodes
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="studio-actions">
                                                    <button className="s-btn s-btn-sec" onClick={() => handlePreview(m.schema)}>
                                                        <Eye size={16} /> LIVE PREVIEW
                                                    </button>
                                                    <button className="s-btn s-btn-pri" onClick={() => handleImport(m.schema)}>
                                                        <Download size={16} /> DOWNLOAD & SYNC
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}

                            {loading && (
                                <motion.div 
                                    key="thinking"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                    className="studio-row ai"
                                >
                                    <div className="studio-processing-card">
                                        <div className="proc-icon-box">
                                            <Cpu size={26} className="spin-slow" />
                                        </div>
                                        <div className="proc-text">
                                            <div className="proc-dots">
                                                <motion.span animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ repeat: Infinity, duration: 1 }} />
                                                <motion.span animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} />
                                                <motion.span animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} />
                                            </div>
                                            <p>{THINKING_MESSAGES[thinkingIdx]}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>

                <footer className="ai-studio-footer">
                    <div className="studio-command-bar">
                        <MessageSquare size={18} className="cmd-icon-main" />
                        <input 
                            type="text" 
                            className="studio-input"
                            placeholder="Describe your form architecture..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <button 
                            className={`studio-send ${input.trim() ? 'active' : ''}`}
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </footer>
            </motion.div>

            <style jsx>{`
                .ai-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(var(--bg-card-rgb), 0.6);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    z-index: 10002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                }
                .ai-studio-container {
                    background: var(--bg-base);
                    width: 100%;
                    max-width: 760px;
                    height: 80vh;
                    max-height: 720px;
                    border-radius: 48px;
                    overflow: hidden;
                    box-shadow: 
                        0 0 0 1px rgba(0, 0, 0, 0.1),
                        0 40px 120px rgba(0, 0, 0, 0.5),
                        0 0 80px rgba(var(--accent-rgb), 0.15);
                    display: flex;
                    flex-direction: column;
                    border: 1px solid var(--border);
                    position: relative;
                }
                
                .ai-studio-header {
                    background: linear-gradient(135deg, #1e1b4b 0%, #1e293b 100%);
                    padding: 28px 48px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid rgba(255, 255, 255, 0.05);
                    flex-shrink: 0;
                    color: white;
                    border-top-left-radius: 48px;
                    border-top-right-radius: 48px;
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }
                .studio-spark-box {
                    width: 52px;
                    height: 52px;
                    background: var(--accent-grad);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
                }
                .header-text h3 {
                    margin: 0;
                    font-size: 1.35rem;
                    font-weight: 900;
                    letter-spacing: 0.05em;
                    color: white;
                }
                .studio-brand {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: var(--accent);
                    letter-spacing: 0.15em;
                    opacity: 0.9;
                }
                .studio-close-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: white;
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: var(--transition);
                }
                .studio-close-btn:hover { 
                    background: rgba(255, 255, 255, 0.2);
                    transform: rotate(90deg); 
                }
                
                .ai-studio-body {
                    flex: 1;
                    padding: 40px 48px;
                    overflow-y: auto;
                    background: var(--bg-surface);
                    display: flex;
                    flex-direction: column;
                    scrollbar-width: thin;
                }
                .ai-studio-body::-webkit-scrollbar { width: 4px; }
                .ai-studio-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
                
                .studio-flow {
                    display: flex;
                    flex-direction: column;
                    gap: 40px; /* Increased gap as requested */
                    padding-bottom: 20px;
                }
                .studio-row { 
                    display: flex; 
                    flex-direction: column; 
                    width: 100%;
                }
                .studio-row.user { align-self: flex-end; align-items: flex-end; }
                .studio-row.ai { align-self: flex-start; align-items: flex-start; }
                
                .studio-bubble {
                    padding: 20px 28px;
                    border-radius: 32px;
                    font-size: 1rem;
                    line-height: 1.6;
                    max-width: 80%; /* Capped width as requested */
                    box-shadow: var(--shadow);
                    position: relative;
                }
                .user .studio-bubble {
                    background: var(--accent-grad);
                    color: white;
                    border-bottom-right-radius: 6px;
                    box-shadow: var(--shadow-glow);
                }
                .ai .studio-bubble {
                    background: var(--bg-base);
                    color: var(--text-primary);
                    border: 1.5px solid var(--accent-soft); /* Glowing border */
                    border-bottom-left-radius: 6px;
                    backdrop-filter: blur(10px);
                }
                .studio-bubble p { margin: 0; white-space: pre-wrap; }
                
                .studio-proposal-card {
                    margin-top: 24px;
                    background: var(--bg-surface);
                    border: 1px solid var(--border);
                    border-radius: 40px;
                    padding: 28px 32px;
                    width: 100%;
                    box-shadow: inset 0 0 20px rgba(var(--accent-rgb), 0.05);
                }
                .proposal-badge-row {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    margin-bottom: 16px;
                }
                .studio-num {
                    width: 26px;
                    height: 26px;
                    background: var(--text-primary);
                    color: var(--bg-base);
                    border-radius: 50%;
                    font-size: 0.65rem;
                    font-weight: 900;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .proposal-title {
                    font-size: 0.85rem;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    color: var(--text-primary);
                }
                .studio-sync-badge {
                    margin-left: auto;
                    background: var(--accent-soft);
                    color: var(--accent);
                    font-size: 0.6rem;
                    font-weight: 900;
                    padding: 5px 12px;
                    border-radius: 30px;
                    letter-spacing: 0.1em;
                }
                .proposal-meta { margin-bottom: 18px; }
                .meta-tag {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    font-weight: 700;
                }
                .studio-schema-list {
                    background: var(--bg-base);
                    border: 1px solid var(--border);
                    border-radius: 28px;
                    overflow: hidden;
                    margin-bottom: 24px;
                }
                .schema-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 24px;
                    border-bottom: 1px solid var(--border);
                }
                .schema-row:last-child { border-bottom: none; }
                .s-label { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); }
                .s-type { font-size: 0.7rem; color: var(--accent); font-weight: 900; text-transform: uppercase; }
                .schema-more {
                    padding: 10px;
                    text-align: center;
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    background: var(--bg-surface);
                    font-weight: 700;
                }
                .studio-actions { display: flex; gap: 14px; }
                .s-btn {
                    flex: 1;
                    height: 50px;
                    border-radius: 25px;
                    font-size: 0.85rem;
                    font-weight: 800;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    transition: var(--transition);
                    border: none;
                }
                .s-btn-sec { 
                    background: var(--bg-base); 
                    border: 1.5px solid var(--border); 
                    color: var(--text-primary); 
                }
                .s-btn-sec:hover { background: var(--bg-card-hover); border-color: var(--accent); }
                .s-btn-pri { 
                    background: var(--text-primary); 
                    color: var(--bg-base); 
                }
                .s-btn-pri:hover { transform: translateY(-3px); box-shadow: var(--shadow-glow); }
                
                .studio-processing-card {
                    background: var(--bg-base);
                    border: 1.5px solid var(--accent-soft);
                    border-radius: 32px;
                    padding: 24px 32px;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                    backdrop-filter: blur(10px);
                }
                .proc-icon-box {
                    width: 52px;
                    height: 52px;
                    background: var(--accent-soft);
                    border-radius: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--accent);
                }
                .proc-text p { margin: 6px 0 0; font-size: 0.95rem; color: var(--text-secondary); font-weight: 600; }
                .proc-dots { display: flex; gap: 6px; }
                .proc-dots span {
                    width: 6px;
                    height: 6px;
                    background: var(--accent);
                    border-radius: 50%;
                }
                
                .ai-studio-footer {
                    padding: 32px 48px 48px;
                    background: var(--bg-base);
                    border-top: 1px solid var(--border);
                    flex-shrink: 0;
                    border-bottom-left-radius: 48px;
                    border-bottom-right-radius: 48px;
                }
                .studio-command-bar {
                    background: var(--bg-surface);
                    border: 2px solid var(--border);
                    border-radius: 36px;
                    height: 72px;
                    display: flex;
                    align-items: center;
                    padding: 0 12px 0 28px;
                    gap: 20px;
                    transition: var(--transition);
                    box-shadow: inset 0 4px 12px rgba(0,0,0,0.02);
                }
                .studio-command-bar:focus-within {
                    border-color: var(--accent);
                    box-shadow: 0 0 0 6px var(--accent-soft);
                    background: var(--bg-base);
                }
                .cmd-icon-main { color: var(--text-muted); }
                .studio-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    outline: none;
                    font-size: 1.05rem;
                    color: var(--text-primary);
                    font-weight: 500;
                }
                .studio-input::placeholder { color: var(--text-muted); font-weight: 400; }
                .studio-send {
                    width: 52px;
                    height: 52px;
                    border-radius: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-muted);
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    cursor: not-allowed;
                    transition: var(--transition);
                }
                .studio-send.active {
                    background: var(--accent-grad);
                    color: white;
                    cursor: pointer;
                    border: none;
                    box-shadow: var(--shadow-glow);
                }
                .studio-send.active:hover { transform: translateY(-2px) scale(1.05); }
                
                .spin-slow { animation: spin 4s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .text-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            `}</style>
        </div>
    );
}
