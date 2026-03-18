import { useState } from 'react';
import RuleBuilder from './RuleBuilder';

export default function GroupConfigModal({ group, onSave, onClose, siblingFields = [] }) {
    const [local, setLocal] = useState({ ...group });

    const handleSave = () => {
        onSave(local);
    };

    return (
        <div className="config-panel-container">
            <div className="modal-box">
                <div className="modal-header">
                    <div className="modal-title">
                        Configure Section Rules
                        <span className="modal-type-badge">
                            Section: {group.groupTitle || 'Untitled Section'}
                        </span>
                    </div>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <div className="validation-section">
                        <div className="rule-section-label">Branching & Logic Rules</div>
                        <p className="form-help" style={{ marginBottom: '16px' }}>
                            Configure rules to show/hide this entire section dynamically based on other fields.
                        </p>
                        <RuleBuilder
                            rulesJson={local.rulesJson}
                            onChange={val => setLocal(prev => ({ ...prev, rulesJson: val }))}
                            fields={siblingFields}
                            isGroup={true}
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave}>💾 Save Rules</button>
                </div>
            </div>
        </div>
    );
}
