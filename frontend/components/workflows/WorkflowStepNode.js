import React from 'react';

function Glyph({ icon, completed }) {
    if (completed) {
        return (
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
                <path d="M20 7L10 17l-6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    switch ((icon || '').toLowerCase()) {
        case 'file':
            return <span className="wsn-icon-fallback">F</span>;
        case 'check':
            return <span className="wsn-icon-fallback">A</span>;
        case 'dollar':
            return <span className="wsn-icon-fallback">$</span>;
        case 'done':
            return <span className="wsn-icon-fallback">D</span>;
        case 'manager':
            return <span className="wsn-icon-fallback">M</span>;
        case 'finance':
            return <span className="wsn-icon-fallback">N</span>;
        case 'builder':
            return <span className="wsn-icon-fallback">B</span>;
        default:
            return <span className="wsn-icon-fallback">S</span>;
    }
}

export default function WorkflowStepNode({ id, name, icon, status = 'pending', role }) {
    const tooltip = role ? `${name} (${role})` : name;
    const stageMessage = status === 'completed'
        ? 'Approved'
        : status === 'rejected'
            ? 'Rejected'
            : null;

    return (
        <div className={`workflow-step-node ${status}`} data-step-id={id} title={tooltip}>
            <div className="workflow-step-icon" aria-hidden="true">
                <Glyph icon={icon} completed={status === 'completed'} />
            </div>
            <div className="workflow-step-name">{name}</div>
            {role ? <div className="workflow-step-role">{role}</div> : null}
            {stageMessage ? (
                <div className={`workflow-step-stage-msg ${status}`}>
                    {stageMessage}
                </div>
            ) : null}
        </div>
    );
}


