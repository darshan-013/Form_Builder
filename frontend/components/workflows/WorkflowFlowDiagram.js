import React from 'react';


function toStateClass(node, index, activeIndex, decision) {
    if (decision === 'REJECTED') return ' rejected';
    if (decision === 'APPROVED') return ' approved';
    if (typeof activeIndex === 'number' && index === activeIndex) return ' active';
    if (node.ready) return ' ready';
    return '';
}

export default function WorkflowFlowDiagram({
    formLabel,
    nodes,
    activeIndex,
    decision = 'PENDING',
    compact = false,
}) {
    const safeNodes = Array.isArray(nodes) ? nodes : [];

    return (
        <div className={`wfd-wrap${compact ? ' compact' : ''}`} role="img" aria-label="Workflow flow diagram">
            <div className="wfd-diagram">
                <div className="wfd-node root">
                    <div className="wfd-title">Form</div>
                    <div className="wfd-subtitle">{formLabel || 'Untitled Form'}</div>
                </div>

                {safeNodes.map((node, index) => (
                    <div className="wfd-node-wrap" key={node.key || `${index}-${node.title || 'step'}`}>
                        <span className="wfd-arrow">{'->'}</span>
                        <div className={`wfd-node${toStateClass(node, index, activeIndex, decision)}`}>
                            <div className="wfd-title">{node.title || `Step ${index + 1}`}</div>
                            <div className="wfd-subtitle">{node.subtitle || 'Pending selection'}</div>
                            <div className="wfd-state">{node.stateText || `Step ${index + 1}`}</div>
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
}



