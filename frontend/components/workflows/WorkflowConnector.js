import React from 'react';

export default function WorkflowConnector({ direction = 'right', status = 'pending', active = false }) {
    const isHorizontal = direction === 'right';
    const isCompleted = status === 'completed';
    const isActive = status === 'active' || active;
    const isRejected = status === 'rejected';

    return (
        <div className={`
            flex items-center justify-center
            ${isHorizontal ? 'h-16 px-4' : 'w-16 py-4 flex-col'}
        `}>
            {/* Connection Line */}
            <div className={`
                relative transition-all duration-700
                ${isHorizontal ? 'w-12 h-0.5' : 'h-12 w-0.5'}
                ${isCompleted ? 'bg-emerald-500' : (isActive ? 'bg-primary shadow-[0_0_10px_var(--primary-glow)]' : 'bg-white/10')}
                ${isRejected ? 'bg-rose-500' : ''}
            `}>
                {/* Animated Flow Dot */}
                {isActive && (
                    <div className={`
                        absolute bg-white rounded-full
                        ${isHorizontal ? 'w-1.5 h-1.5 top-1/2 -translate-y-1/2 animate-flow-horizontal' : 'w-1.5 h-1.5 left-1/2 -translate-x-1/2 animate-flow-vertical'}
                    `} />
                )}

                {/* Arrowhead */}
                <div className={`
                    absolute
                    ${isHorizontal ? 'right-0 top-1/2 -translate-y-1/2' : 'bottom-0 left-1/2 -translate-x-1/2'}
                    ${isHorizontal ? 'border-t-[4px] border-b-[4px] border-l-[6px] border-t-transparent border-b-transparent' : 'border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent'}
                    ${isCompleted ? 'border-l-emerald-500' : (isActive ? 'border-l-primary' : 'border-l-white/10')}
                    ${!isHorizontal && isCompleted ? 'border-t-emerald-500' : (!isHorizontal && isActive ? 'border-t-primary' : (!isHorizontal ? 'border-t-white/10' : ''))}
                `} />
            </div>

            <style jsx>{`
                @keyframes flow-horizontal {
                    0% { left: 0; opacity: 0; }
                    50% { opacity: 1; }
                    100% { left: 100%; opacity: 0; }
                }
                @keyframes flow-vertical {
                    0% { top: 0; opacity: 0; }
                    50% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-flow-horizontal {
                    animation: flow-horizontal 2s infinite linear;
                }
                .animate-flow-vertical {
                    animation: flow-vertical 2s infinite linear;
                }
            `}</style>
        </div>
    );
}
