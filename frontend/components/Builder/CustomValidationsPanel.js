import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Plus, Trash2, AlertCircle, CheckCircle2, Info, 
    ChevronDown, ChevronUp, Code, MessageSquare, 
    Target, Settings2, HelpCircle, Save, BarChart3, Zap, Shield, Search
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
                <p>Establishing secure validation engine...</p>
            </div>
        );
    }

    return (
        <div className="validations-manager-v2">
            {/* Header */}
            <header className="v-header">
                <div className="v-header-content">
                    <h2 className="v-title">
                        <AlertCircle className="icon-glow" style={{ color: 'var(--accent)' }} size={24} />
                        Logical Rule Builder
                    </h2>
                    <p className="v-subtitle">
                        Create advanced field-level or form-level validation logic.
                    </p>
                </div>
                <button 
                    onClick={() => {
                        if (isAdding) resetForm();
                        else setIsAdding(true);
                    }}
                    className={`btn ${isAdding ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px' }}
                >
                    {isAdding ? <Plus size={18} style={{ transform: 'rotate(45deg)' }} /> : <Plus size={18} />}
                    <span style={{ fontWeight: 700 }}>{isAdding ? 'Cancel' : 'Create Rule'}</span>
                </button>
            </header>

            {/* Add Rule Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="v-editor-grid">
                            {/* Tier 1: Target */}
                            <div className="v-editor-tier">
                                <div className="v-tier-info">
                                    <div className="v-tier-title"><Target size={16} /> Target Scope</div>
                                    <div className="v-tier-desc">Select whether this rule applies to a specific field or the entire form.</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                    <div className="form-group">
                                        <label className="v-label">Scope</label>
                                        <select 
                                            className="v-select"
                                            value={newRule.scope}
                                            onChange={(e) => setNewRule({ ...newRule, scope: e.target.value })}
                                        >
                                            <option value="FIELD">Field Level</option>
                                            <option value="FORM">Form Level</option>
                                        </select>
                                    </div>
                                    {newRule.scope === 'FIELD' && (
                                        <div className="form-group">
                                            <label className="v-label">Target Field</label>
                                            <select 
                                                className="v-select"
                                                value={newRule.fieldKey}
                                                onChange={(e) => setNewRule({ ...newRule, fieldKey: e.target.value })}
                                            >
                                                <option value="">Select a field...</option>
                                                {fields.filter(f => !['section_header', 'label_text', 'description_block', 'page_break'].includes(f.type)).map(f => (
                                                    <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tier 2: Logic */}
                            <div className="v-editor-tier">
                                <div className="v-tier-info">
                                    <div className="v-tier-title"><Zap size={16} /> Validation Logic</div>
                                    <div className="v-tier-desc">Write the logical expression. If this evaluates to <strong>TRUE</strong>, the validation fails.</div>
                                </div>
                                <div className="v-editor-col">
                                    <div className="form-group">
                                        <label className="v-label">Logical Expression (JavaScript)</label>
                                        <textarea 
                                            className="v-textarea"
                                            placeholder="e.g. {age} < 18 || {email}.endsWith('@gmail.com')"
                                            value={newRule.expression}
                                            onChange={(e) => setNewRule({ ...newRule, expression: e.target.value })}
                                        />
                                    </div>
                                    <div className="v-keys-helper">
                                        <div className="v-helper-title"><Search size={12} /> Insert Field Reference</div>
                                        <div className="v-key-group">
                                            {fields.filter(f => !['section_header', 'label_text', 'description_block', 'page_break'].includes(f.type)).map(f => (
                                                <button key={f.key} onClick={() => insertFieldKey(`{${f.key}}`)} className="v-key-pill">
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tier 3: Message */}
                            <div className="v-editor-tier">
                                <div className="v-tier-info">
                                    <div className="v-tier-title"><MessageSquare size={16} /> Error Response</div>
                                    <div className="v-tier-desc">The message displayed to the user when the logic above matches.</div>
                                </div>
                                <div className="v-editor-col">
                                    <div className="form-group">
                                        <label className="v-label">Error Message</label>
                                        <input 
                                            type="text"
                                            className="v-input"
                                            placeholder="e.g. You must be at least 18 years old."
                                            value={newRule.errorMessage}
                                            onChange={(e) => setNewRule({ ...newRule, errorMessage: e.target.value })}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                        <div className="form-group" style={{ flex: 1, maxWidth: 200 }}>
                                            <label className="v-label">Execution Priority</label>
                                            <input 
                                                type="number"
                                                className="v-input"
                                                value={newRule.executionOrder}
                                                onChange={(e) => setNewRule({ ...newRule, executionOrder: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <button className="btn btn-secondary" onClick={resetForm}>Discard</button>
                                            <button className="btn btn-primary" onClick={handleAddRule}>
                                                <Save size={16} />
                                                {editingRuleId ? 'Update Rule' : 'Save Rule'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rules List */}
            <div className="v-rules-container">
                <div className="v-rules-divider">
                    <span className="v-rules-divider-text">Active Logic Threads ({rules.length})</span>
                </div>

                {rules.length === 0 ? (
                    <div className="v-empty-state" style={{ textAlign: 'center', padding: '100px 40px', background: 'rgba(255,255,255,0.01)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <Shield size={40} style={{ color: 'var(--accent)', opacity: 0.3 }} />
                        </div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>No active validations</h3>
                        <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>Your form currently has no custom logic. Click "Create Rule" above to add your first high-performance validation.</p>
                    </div>
                ) : (
                    <div className="v-rules-list">
                        {rules.map(rule => (
                            <motion.div 
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="v-rule-card" 
                                key={rule.id}
                            >
                                <div className="v-rule-main">
                                    <div className={`v-rule-icon-box ${rule.scope.toLowerCase()}`}>
                                        {rule.scope === 'FIELD' ? <Target size={22} /> : <AlertCircle size={22} />}
                                    </div>
                                    <div className="v-rule-content">
                                        <div className="v-rule-top">
                                            <h4 className="v-rule-message">{rule.errorMessage}</h4>
                                            <div className="v-rule-badges">
                                                <span className={`v-badge ${rule.scope.toLowerCase()}`}>{rule.scope} LEVEL</span>
                                                {rule.executionOrder > 0 && <span className="v-badge field" style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.2)' }}>PRIORITY: {rule.executionOrder}</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {rule.scope === 'FIELD' && (
                                                <div className="v-field-key-badge">TARGET SOURCE: {rule.fieldKey}</div>
                                            )}
                                            <div className="v-logic-pill">
                                                <Code size={14} />
                                                <code>{rule.expression}</code>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="v-rule-actions">
                                    <button className="v-action-btn edit" onClick={() => handleEditRule(rule)} title="Edit Configuration">
                                        <Settings2 size={16} />
                                    </button>
                                    <button className="v-action-btn delete" onClick={() => handleDeleteRule(rule.id)} title="Remove Rule">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Modal */}
            <AnimatePresence>
                {isDeleteConfirmOpen && (
                    <div className="builder-modal-backdrop" style={{ zIndex: 10002 }}>
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="builder-modal"
                        >
                            <div className="v-rule-icon-box" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', margin: '0 auto 20px' }}>
                                <Trash2 size={24} />
                            </div>
                            <h3>Delete Validation Rule?</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>This action cannot be undone. Are you sure you want to remove this validation logic from your form?</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button className="btn btn-secondary" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</button>
                                <button className="btn btn-primary" style={{ background: '#ef4444' }} onClick={confirmDelete}>Yes, Remove Rule</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CustomValidationsPanel;
