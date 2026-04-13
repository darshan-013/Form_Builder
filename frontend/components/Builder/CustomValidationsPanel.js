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
        <div className="validations-manager-v2">
            {/* Header */}
            <header className="v-header">
                <div className="v-header-content">
                    <h2 className="v-title">
                        <AlertCircle className="icon-glow" size={20} />
                        Custom Validation Rules
                    </h2>
                    <p className="v-subtitle">
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
                         <div className="v-editor-grid">
                            {/* Left Column */}
                            <div className="v-editor-col">
                                <div className="form-group">
                                    <label className="v-label">Rule Scope</label>
                                    <select 
                                        className="v-select"
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
                                        <label className="v-label">Target Field</label>
                                        <select 
                                            className="v-select"
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
                                    <label className="v-label">Error Message</label>
                                    <input 
                                        type="text"
                                        className="v-input"
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
                                    </div>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="v-editor-col">
                                <div className="form-group">
                                    <label className="v-label">Expression Logic</label>
                                    <textarea 
                                        className="v-textarea"
                                        placeholder="age >= 18"
                                        value={newRule.expression}
                                        onChange={(e) => setNewRule({...newRule, expression: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <span className="v-label" style={{ marginBottom: '8px', display: 'block' }}>Field Keys Helper</span>
                                    <div className="v-keys-helper">
                                        {fields.map(f => (
                                            <button 
                                                key={f.fieldKey}
                                                type="button"
                                                onClick={() => insertFieldKey(f.fieldKey)}
                                                className="v-key-pill"
                                                title={f.label}
                                            >
                                                {f.fieldKey}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="v-editor-actions">
                                    <button 
                                        onClick={handleAddRule}
                                        className="btn btn-primary"
                                    >
                                        <Save size={16} />
                                        {editingRuleId ? 'Update Rule' : 'Save Rule'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rules List */}
            <div className="v-rules-container">

                {rules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 24px', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                        <Settings2 size={48} style={{ color: 'var(--text-muted)', opacity: 0.2, marginBottom: '16px' }} />
                        <h3 style={{ color: 'var(--text-muted)', fontWeight: '600' }}>No custom rules yet</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>Define complex logic to ensure your form data is perfect.</p>
                    </div>
                ) : (
                         <div className="v-rules-list">
                        {rules.map((rule, idx) => (
                            <motion.div 
                                key={rule.id}
                                layout
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                className="v-rule-card"
                            >
                                <div className="v-rule-main">
                                    <div className={`v-rule-icon-box ${rule.scope.toLowerCase()}`}>
                                        {rule.scope === 'FIELD' ? <Target size={18} /> : <BarChart3 size={18} />}
                                    </div>
                                    <div className="v-rule-content">
                                        <div className="v-rule-top">
                                            <h4 className="v-rule-message">{rule.errorMessage}</h4>
                                            <div className="v-rule-badges">
                                                <span className={`v-badge ${rule.scope.toLowerCase()}`}>
                                                    {rule.scope}
                                                </span>
                                                {rule.fieldKey && (
                                                    <span className="v-field-key-badge">
                                                        @{rule.fieldKey}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="v-rule-code">
                                            <Code size={13} strokeWidth={3} />
                                            <code>{rule.expression}</code>
                                        </div>
                                    </div>
                                </div>
                                <div className="v-rule-actions">
                                    <button 
                                        onClick={() => handleEditRule(rule)}
                                        className="v-action-btn edit"
                                        title="Edit Rule"
                                    >
                                        <Settings2 size={15} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="v-action-btn delete"
                                        title="Delete Rule"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer className="v-footer">
                <Info size={14} className="v-info-icon" />
                <span>Need help with expressions? Check the <a href="#" className="v-link">Validation Guide</a>.</span>
            </footer>
            
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

        </div>
    );
};

export default CustomValidationsPanel;
