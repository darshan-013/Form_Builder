import React from 'react';

export default function WorkflowConnector({ direction = 'right', status = 'pending', active = false }) {
    const vertical = direction === 'down';
    const effectiveStatus = status;
    return (
        <div className={`workflow-connector ${effectiveStatus}${vertical ? ' vertical' : ''}${active ? ' animate' : ''}`} aria-hidden="true">
            <span className="workflow-connector-dot" />
            <span className="workflow-connector-line" />
            <span className="workflow-connector-arrow">{vertical ? 'v' : '>'}</span>
        </div>
    );
}



