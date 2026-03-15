import React from 'react';
import WorkflowStepNode from './WorkflowStepNode';
import WorkflowConnector from './WorkflowConnector';

function normalizeSteps(steps, activeStepIndex) {
    const safe = Array.isArray(steps) ? steps : [];
    const hasExplicitStatus = safe.some((s) => s && s.status);

    if (hasExplicitStatus) {
        return safe.map((step, index) => ({
            ...step,
            id: step?.id ?? index + 1,
            status: step?.status || 'pending',
        }));
    }

    return safe.map((step, index) => {
        let status = 'pending';
        if (typeof activeStepIndex === 'number') {
            if (index < activeStepIndex) status = 'completed';
            else if (index === activeStepIndex) status = 'active';
        }
        return {
            ...step,
            id: step?.id ?? index + 1,
            status,
        };
    });
}

export default function WorkflowDiagram({ steps, activeStepIndex = 0 }) {
    const normalized = normalizeSteps(steps, activeStepIndex);

    function getConnectorStatus(currentStep, nextStep) {
        if (currentStep?.status === 'rejected' || nextStep?.status === 'rejected') {
            return 'rejected';
        }
        if (currentStep?.status === 'completed' && nextStep?.status === 'completed') {
            return 'completed';
        }
        if (currentStep?.status === 'active' || nextStep?.status === 'active') {
            return 'active';
        }
        return 'pending';
    }

    return (
        <div className="workflow-diagram-shell">
            <div className="workflow-steps-track">
                {normalized.map((step, index) => {
                    const nextStep = normalized[index + 1];
                    const connectorStatus = nextStep ? getConnectorStatus(step, nextStep) : 'pending';
                    const connectorActive = connectorStatus === 'completed' || connectorStatus === 'active' || connectorStatus === 'rejected';
                    return (
                        <React.Fragment key={step.id}>
                            <WorkflowStepNode
                                id={step.id}
                                name={step.name}
                                icon={step.icon}
                                status={step.status}
                                role={step.role}
                            />
                            {index < normalized.length - 1
                                ? <WorkflowConnector status={connectorStatus} active={connectorActive} />
                                : null}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}


