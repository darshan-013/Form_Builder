import React from 'react';
import Badge from '../ui/Badge';

const ICONS = {
    file: '📄',
    check: '✅',
    dollar: '💰',
    done: '🏁',
    manager: '👤',
    finance: '🏦',
    builder: '🏗️',
    start: '🚀',
    end: '🏁',
};

export default function WorkflowStepNode({ id, name, icon, status = 'pending', role }) {
    const isCompleted = status === 'completed';
    const isActive = status === 'active';
    const isRejected = status === 'rejected';

    const statusColors = {
        completed: 'emerald',
        active: 'primary',
        rejected: 'rose',
        pending: 'gray',
    };

    const color = statusColors[status] || 'gray';

    return (
        <div 
            className={`flex flex-col items-center gap-3 transition-all duration-500 ${isActive ? 'scale-110 z-10' : 'scale-100'}`}
            data-step-id={id}
        >
            {/* Node Circle */}
            <div className={`
                relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                ${isActive ? 'bg-primary shadow-[0_0_20px_var(--primary-glow)] ring-2 ring-primary/50' : 'bg-white/5 border border-white/10'}
                ${isCompleted ? 'bg-emerald-500/10 border-emerald-500/30' : ''}
                ${isRejected ? 'bg-rose-500/10 border-rose-500/30' : ''}
            `}>
                {/* Icon/Glyph */}
                <div className={`text-2xl ${isCompleted || isRejected ? '' : (isActive ? 'text-white' : 'text-gray-500')}`}>
                    {isCompleted ? '✅' : (isRejected ? '❌' : (ICONS[icon?.toLowerCase()] || '⚙️'))}
                </div>

                {/* Status Indicator Dot */}
                {isActive && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full border-2 border-slate-950 animate-pulse" />
                )}
            </div>

            {/* Label Container */}
            <div className="text-center max-w-[120px]">
                <h4 className={`text-xs font-bold transition-colors ${isActive ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>
                    {name}
                </h4>
                {role && (
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5 uppercase tracking-tighter">
                        {role}
                    </p>
                )}
                
                {/* Status Badge */}
                <div className="mt-2">
                    {isCompleted && <Badge variant="success" size="sm" className="px-2 py-0 text-[9px]">Approved</Badge>}
                    {isRejected && <Badge variant="danger" size="sm" className="px-2 py-0 text-[9px]">Rejected</Badge>}
                    {isActive && <Badge variant="primary" size="sm" className="px-2 py-0 text-[9px] pulse">Active</Badge>}
                    {status === 'pending' && <Badge variant="ghost" size="sm" className="px-2 py-0 text-[9px] opacity-40">Pending</Badge>}
                </div>
            </div>
        </div>
    );
}
