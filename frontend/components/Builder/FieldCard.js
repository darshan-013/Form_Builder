import Button from '../ui/Button';
import Badge from '../ui/Badge';

const TYPE_META = {
    text:                 { label: 'Text',            icon: 'abc',     color: 'indigo' },
    number:               { label: 'Number',          icon: '123',     color: 'blue' },
    date:                 { label: 'Date',            icon: 'event',   color: 'teal' },
    boolean:              { label: 'Boolean',         icon: 'toggle',  color: 'emerald' },
    dropdown:             { label: 'Dropdown',        icon: 'menu',    color: 'amber' },
    radio:                { label: 'Radio',           icon: 'circle',  color: 'orange' },
    multiple_choice:      { label: 'Multiple Choice', icon: 'list',    color: 'rose' },
    linear_scale:         { label: 'Linear Scale',    icon: 'linear',  color: 'violet' },
    star_rating:          { label: 'Star Rating',     icon: 'star',    color: 'yellow' },
    multiple_choice_grid: { label: 'Choice Grid',     icon: 'grid',    color: 'sky' },
    checkbox_grid:        { label: 'Checkbox Grid',   icon: 'grid_on', color: 'cyan' },
    file:                 { label: 'File',            icon: 'attach',  color: 'gray' },
    // Static types
    section_header:       { label: 'Section Header',    icon: 'title',   color: 'slate' },
    label_text:           { label: 'Label Text',        icon: 'label',   color: 'slate' },
    description_block:    { label: 'Description Block', icon: 'subject', color: 'slate' },
    page_break:           { label: 'Page Break',        icon: 'break',   color: 'slate' },
};

export default function FieldCard({
    field, index, onEdit, onRemove,
    onDragStart, onDragOver, onDrop, onDragEnd,
    isDragging, dropPosition,
}) {
    const meta = TYPE_META[field.fieldType] || { label: field.fieldType, icon: 'edit', color: 'indigo' };
    const isStatic = !!field.isStatic;
    const isPageBreak = field.fieldType === 'page_break';

    const cardClass = `
        relative group transition-all duration-300
        ${isPageBreak ? 'my-12' : 'mb-4'}
        ${isDragging ? 'opacity-40 scale-[0.98]' : 'opacity-100 scale-100'}
        ${dropPosition === 'top' ? 'pt-4 border-t-2 border-primary' : ''}
        ${dropPosition === 'bottom' ? 'pb-4 border-b-2 border-primary' : ''}
    `;

    if (isPageBreak) {
        return (
            <div
                id={`field-card-${field.id}`}
                className={cardClass}
                draggable
                onDragStart={(e) => onDragStart(e, index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => onDrop(e, index)}
                onDragEnd={onDragEnd}
            >
                <div className="flex items-center gap-4 py-8">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-white/10 to-transparent" />
                    <div className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 border border-white/10 shadow-lg backdrop-blur-md">
                        <span className="text-primary">⊸</span>
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Page Break</span>
                        {field.data && <span className="text-xs text-gray-400 font-medium">— {field.data}</span>}
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-white/10 to-transparent" />
                    
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-4">
                         <Button variant="ghost" size="sm" className="w-8 h-8 p-0 bg-white/5 hover:bg-white/10" onClick={() => onEdit(field)}>✎</Button>
                         <Button variant="ghost" size="sm" className="w-8 h-8 p-0 bg-white/5 hover:bg-red-500/20 text-red-500" onClick={() => onRemove(field.id)}>✕</Button>
                    </div>
                </div>
            </div>
        );
    }

    const getColorClasses = (color) => {
        const maps = {
            blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-500' },
            indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-500' },
            teal:    { bg: 'bg-teal-500/10',    text: 'text-teal-500' },
            emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
            amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-500' },
            orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-500' },
            rose:    { bg: 'bg-rose-500/10',    text: 'text-rose-500' },
            violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-500' },
            yellow:  { bg: 'bg-yellow-500/10',  text: 'text-yellow-500' },
            sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-500' },
            cyan:    { bg: 'bg-cyan-500/10',    text: 'text-cyan-500' },
            gray:    { bg: 'bg-gray-500/10',    text: 'text-gray-500' },
            slate:   { bg: 'bg-slate-500/10',   text: 'text-slate-500' }
        };
        return maps[color] || maps.indigo;
    };

    const colorClasses = getColorClasses(meta.color);

    return (
        <div
            id={`field-card-${field.id}`}
            className={cardClass}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
        >
            <div className={`
                flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300
                ${isDragging ? 'shadow-none' : 'glass shadow-lg hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5'}
                bg-white/[0.03] border-white/5
            `}>
                {/* Drag handle */}
                <span className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-primary transition-colors pr-2">
                    ⠿
                </span>

                {/* Info Container */}
                <div className="flex-1 min-w-0 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClasses.bg} ${colorClasses.text} shadow-inner`}>
                        <span className="font-bold text-xs">{meta.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                         {isStatic ? (
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 italic truncate">
                                {field.data || <span className="opacity-30">Static content block...</span>}
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                        {field.label || <span className="opacity-30 font-normal italic">Untitled field</span>}
                                    </h4>
                                    {field.required && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <Badge variant="ghost" className="text-[10px] py-0.5 px-2 bg-white/5 font-mono">
                                        {field.fieldKey || 'no_key'}
                                    </Badge>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        {meta.label}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-9 h-9 p-0 bg-white/5 hover:bg-white/10" 
                        onClick={() => onEdit(field)}
                    >
                        ✎
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-9 h-9 p-0 bg-white/5 hover:bg-red-500/20 text-red-500" 
                        onClick={() => onRemove(field.id)}
                    >
                        ✕
                    </Button>
                </div>
            </div>
        </div>
    );
}
