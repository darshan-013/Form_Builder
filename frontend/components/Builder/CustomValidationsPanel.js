import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Plus, Trash2, AlertCircle, CheckCircle2, Info, 
    ChevronDown, ChevronUp, Code, MessageSquare, 
    Target, Settings2, HelpCircle 
} from 'lucide-react';
import * as api from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

const EMPTY_ARRAY = [];

const CustomValidationsPanel = ({ formId, versionId, fields = EMPTY_ARRAY, initialRules = EMPTY_ARRAY, onRulesChange }) => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [ruleIdToDelete, setRuleIdToDelete] = useState(null);
    
    const [newRule, setNewRule] = useState({
        scope: 'FIELD',
        fieldKey: '',
        expression: '',
        errorMessage: '',
        executionOrder: 0
    });

    useEffect(() => {
        if (formId && versionId) {
            fetchRules();
        } else if (initialRules && initialRules.length > 0) {
            setRules(initialRules);
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, [formId, versionId, initialRules]);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await api.getCustomValidations(formId, versionId);
            setRules(res || []);
        } catch (err) {
            console.error('Failed to fetch rules:', err);
            toastError('Failed to load validation rules');
        } finally {
            setLoading(false);
        }
    };

    const handleAddRule = async () => {
        if (!newRule.expression || !newRule.errorMessage) {
            toastError('Expression and error message are required');
            return;
        }

        if (!formId) {
            // Local mode
            if (editingRuleId) {
                const updated = rules.map(r => r.id === editingRuleId ? { ...newRule, id: editingRuleId } : r);
                setRules(updated);
                if (onRulesChange) onRulesChange(updated);
                toastSuccess('Rule updated locally');
            } else {
                const rule = { ...newRule, id: Math.random().toString(36).substr(2, 9) };
                const updated = [...rules, rule];
                setRules(updated);
                if (onRulesChange) onRulesChange(updated);
                toastSuccess('Rule added locally');
            }
            resetForm();
            return;
        }

        try {
            if (editingRuleId) {
                const res = await api.updateCustomValidation(formId, versionId, editingRuleId, newRule);
                setRules(rules.map(r => r.id === editingRuleId ? res : r));
                toastSuccess('Validation rule updated');
            } else {
                const res = await api.addCustomValidation(formId, versionId, newRule);
                setRules([...rules, res]);
                toastSuccess('Validation rule added');
            }
            resetForm();
        } catch (err) {
            console.error('Failed to save rule:', err);
            toastError(err.message || 'Failed to save rule');
        }
    };

    const resetForm = () => {
        setIsAdding(false);
        setEditingRuleId(null);
        setNewRule({
            scope: 'FIELD',
            fieldKey: '',
            expression: '',
            errorMessage: '',
            executionOrder: 0
        });
    };

    const handleEditRule = (rule) => {
        setEditingRuleId(rule.id);
        setNewRule({
            scope: rule.scope,
            fieldKey: rule.fieldKey || '',
            expression: rule.expression,
            errorMessage: rule.errorMessage,
            executionOrder: rule.executionOrder || 0
        });
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteRule = (ruleId) => {
        setRuleIdToDelete(ruleId);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!ruleIdToDelete) return;
        
        const idToDel = ruleIdToDelete;
        setIsDeleteConfirmOpen(false);
        setRuleIdToDelete(null);

        if (!formId) {
            // Local mode
            const updated = rules.filter(r => r.id !== idToDel);
            setRules(updated);
            if (onRulesChange) onRulesChange(updated);
            toastSuccess('Rule removed');
            return;
        }

        try {
            await api.deleteCustomValidation(formId, versionId, idToDel);
            setRules(rules.filter(r => r.id !== idToDel));
            toastSuccess('Rule deleted');
        } catch (err) {
            console.error('Failed to delete rule:', err);
            toastError('Failed to delete rule');
        }
    };

    const insertFieldKey = (key) => {
        setNewRule({ ...newRule, expression: newRule.expression + key });
    };

    if (loading) {
        return (
            <div className="loading-center">
                <span className="spinner" />
                <p>Loading validation engine...</p>
            </div>
        );
    }

    return (
        <div className="custom-validations-container card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="panel-header" style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertCircle className="icon-glow" style={{ color: 'var(--accent)' }} />
                        Custom Validation Rules
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                        Define complex logic for field-level or form-level validation.
                    </p>
                </div>
                <button 
                    onClick={() => {
                        if (isAdding) resetForm();
                        else setIsAdding(true);
                    }}
                    className={`btn ${isAdding ? 'btn-secondary' : 'btn-primary'}`}
                >
                    {isAdding ? <ChevronUp size={16} /> : <Plus size={16} />}
                    {isAdding ? 'Cancel' : 'New Rule'}
                </button>
            </div>

            {/* Add Rule Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}
                    >
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                            {/* Left Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="form-group">
                                    <label className="form-label">Rule Scope</label>
                                    <select 
                                        className="form-select"
                                        value={newRule.scope}
                                        onChange={(e) => {
                                            const newScope = e.target.value;
                                            setNewRule({
                                                ...newRule, 
                                                scope: newScope,
                                                fieldKey: newScope === 'FORM' ? '' : newRule.fieldKey
                                            });
                                        }}
                                    >
                                        <option value="FIELD">Field Specific</option>
                                        <option value="FORM">Global Form Rule</option>
                                    </select>
                                </div>

                                {newRule.scope === 'FIELD' && (
                                    <div className="form-group">
                                        <label className="form-label">Target Field</label>
                                        <select 
                                            className="form-select"
                                            value={newRule.fieldKey}
                                            onChange={(e) => setNewRule({...newRule, fieldKey: e.target.value})}
                                        >
                                            <option value="">— select target field —</option>
                                            {fields.map(f => (
                                                <option key={f.fieldKey} value={f.fieldKey}>{f.label || f.fieldKey}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Error Message</label>
                                    <input 
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g. Employee age must be at least 18"
                                        value={newRule.errorMessage}
                                        onChange={(e) => setNewRule({...newRule, errorMessage: e.target.value})}
                                    />
                                </div>

                                <div style={{ 
                                    padding: '12px', 
                                    background: 'var(--accent-soft)', 
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    gap: '12px',
                                    fontSize: '0.8rem'
                                }}>
                                    <Info size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <div style={{ color: 'var(--text-secondary)' }}>
                                        <strong>Tip:</strong> Click on field keys in the helper to insert them into your expression.
                                        Use operators like <code>==</code>, <code>!=</code>, <code>&&</code>, <code>||</code>.
                                    </div>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="form-group">
                                    <label className="form-label">Expression Logic</label>
                                    <textarea 
                                        className="form-textarea"
                                        style={{ height: '120px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                        placeholder="age >= 18"
                                        value={newRule.expression}
                                        onChange={(e) => setNewRule({...newRule, expression: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <span className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Field Keys Helper</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto', padding: '4px' }}>
                                        {fields.map(f => (
                                            <button 
                                                key={f.fieldKey}
                                                type="button"
                                                onClick={() => insertFieldKey(f.fieldKey)}
                                                className="btn btn-xs btn-secondary"
                                                style={{ fontFamily: 'monospace' }}
                                                title={f.label}
                                            >
                                                {f.fieldKey}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                                    <button 
                                        onClick={handleAddRule}
                                        className="btn btn-primary"
                                        style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                                    >
                                        {editingRuleId ? 'Update Rule' : 'Save Rule'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rules List */}
            <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ height: '1px', background: 'var(--border)', flexGrow: 1 }}></div>
                    <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Active Rules ({rules.length})
                    </span>
                    <div style={{ height: '1px', background: 'var(--border)', flexGrow: 1 }}></div>
                </div>

                {rules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 24px', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                        <Settings2 size={48} style={{ color: 'var(--text-muted)', opacity: 0.2, marginBottom: '16px' }} />
                        <h3 style={{ color: 'var(--text-muted)', fontWeight: '600' }}>No custom rules yet</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>Define complex logic to ensure your form data is perfect.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {rules.map((rule, idx) => (
                            <motion.div 
                                key={rule.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="rule-card"
                                style={{ 
                                    background: 'var(--bg-card)', 
                                    border: '1px solid var(--border)', 
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '16px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    transition: 'var(--transition)'
                                }}
                            >
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <div style={{ 
                                        marginTop: '4px', 
                                        padding: '8px', 
                                        borderRadius: '8px', 
                                        background: rule.scope === 'FIELD' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(236, 72, 153, 0.1)',
                                        color: rule.scope === 'FIELD' ? 'var(--accent)' : 'var(--accent-3)'
                                    }}>
                                        {rule.scope === 'FIELD' ? <Target size={20} /> : <Settings2 size={20} />}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{rule.errorMessage}</h4>
                                            <span className={`badge ${rule.scope === 'FIELD' ? 'badge-text' : 'badge-dropdown'}`} style={{ fontSize: '9px' }}>
                                                {rule.scope}
                                            </span>
                                            {rule.fieldKey && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                                    @{rule.fieldKey}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                padding: '6px 12px', 
                                                background: '#000', 
                                                borderRadius: '6px', 
                                                border: '1px solid var(--border)' 
                                            }}>
                                                <Code size={14} style={{ color: 'var(--accent)' }} />
                                                <code style={{ fontSize: '0.75rem', color: 'var(--success)' }}>{rule.expression}</code>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={() => handleEditRule(rule)}
                                        className="btn btn-xs btn-secondary"
                                        style={{ padding: '8px' }}
                                        title="Edit Rule"
                                    >
                                        <Settings2 size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="btn btn-xs btn-danger"
                                        style={{ padding: '8px' }}
                                        title="Delete Rule"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.1)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <HelpCircle size={14} />
                <span>Need help with expressions? Check the <a href="#" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Validation Guide</a>.</span>
            </div>
            
            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {isDeleteConfirmOpen && (
                    <div className="modal-overlay" style={{ background: 'rgba(6, 6, 18, 0.85)', backdropFilter: 'blur(12px)' }}>
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="modal-box" 
                            style={{ 
                                maxWidth: '400px', 
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                background: 'rgba(15, 12, 30, 0.98)'
                            }}
                        >
                            <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.1)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ padding: '8px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                                        <Trash2 size={20} />
                                    </div>
                                    <h3 className="modal-title">Delete Rule?</h3>
                                </div>
                            </div>
                            <div style={{ padding: '24px' }}>
                                <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5', fontSize: '0.95rem' }}>
                                    Are you sure you want to remove this validation rule? This action cannot be undone.
                                </p>
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setIsDeleteConfirmOpen(false)}>
                                    Cancel
                                </button>
                                <button 
                                    className="btn btn-danger" 
                                    style={{ background: '#EF4444', borderColor: '#EF4444', color: '#fff' }}
                                    onClick={confirmDelete}
                                >
                                    Delete Rule
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <style jsx>{`
                .rule-card:hover {
                    border-color: var(--accent) !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                    transform: translateY(-2px);
                }
                .icon-glow {
                    filter: drop-shadow(0 0 8px var(--accent));
                }
            `}</style>
        </div>
    );
};

export default CustomValidationsPanel;
