import React from 'react';

function HeaderIcon() {
    return (
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
            <rect x="3" y="7" width="10" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="11" y="3" width="10" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

export default function WorkflowHeader({ title, subtitle }) {
    return (
        <div className="workflow-header-banner">
            <div className="workflow-header-title-row">
                <span className="workflow-header-icon"><HeaderIcon /></span>
                <h1>{title || 'Workflow Process'}</h1>
            </div>
            {subtitle ? <p>{subtitle}</p> : null}
        </div>
    );
}

