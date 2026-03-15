import Badge from '../ui/Badge';

const SECTION_TYPES = [
    { type: 'field_group', label: 'Section Group', icon: '📁', color: 'blue', desc: 'Visual container to group fields into sections' },
];

const FIELD_TYPES = [
    { type: 'text', label: 'Text Input', icon: 'abc', color: 'indigo', desc: 'Short or long text input' },
    { type: 'number', label: 'Number', icon: '123', color: 'blue', desc: 'Numeric value' },
    { type: 'date', label: 'Date Picker', icon: 'event', color: 'teal', desc: 'Date picker' },
    { type: 'boolean', label: 'Toggle', icon: 'toggle', color: 'emerald', desc: 'True / False toggle' },
    { type: 'dropdown', label: 'Dropdown', icon: 'menu', color: 'amber', desc: 'Select from dropdown list' },
    { type: 'radio', label: 'Radio', icon: 'circle', color: 'orange', desc: 'Single choice radio buttons' },
    { type: 'multiple_choice', label: 'Checkboxes', icon: 'list', color: 'rose', desc: 'Multi-select checkboxes' },
    { type: 'linear_scale', label: 'Linear Scale', icon: 'linear', color: 'violet', desc: 'Rate on a numeric scale' },
    { type: 'star_rating', label: 'Star Rating', icon: 'star', color: 'yellow', desc: 'Fixed 5-star rating' },
    { type: 'multiple_choice_grid', label: 'Choice Grid', icon: 'grid', color: 'sky', desc: 'One selection per row' },
    { type: 'checkbox_grid', label: 'Checkbox Grid', icon: 'grid_on', color: 'cyan', desc: 'Multiple selections per row' },
    { type: 'file', label: 'File Upload', icon: 'attach', color: 'gray', desc: 'File upload' },
];

const STATIC_TYPES = [
    { type: 'section_header', label: 'Header', icon: 'title', color: 'slate', desc: 'Bold section title' },
    { type: 'label_text', label: 'Label', icon: 'label', color: 'slate', desc: 'Plain inline label' },
    { type: 'description_block', label: 'Description', icon: 'subject', color: 'slate', desc: 'Descriptive paragraph' },
    { type: 'page_break', label: 'Page Break', icon: 'break', color: 'slate', desc: 'Split form into steps' },
];

export default function FieldPalette() {
    const handleDragStart = (e, type) => {
        e.dataTransfer.setData('source', 'palette');
        e.dataTransfer.setData('fieldType', type);
        e.dataTransfer.setData('application/x-field-type', type);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const getColorClasses = (color) => {
        const maps = {
            blue: {
                bg: 'bg-blue-500/10',
                border: 'hover:border-blue-500/30',
                hoverBg: 'hover:bg-blue-500/[0.05]',
                text: 'text-blue-500'
            },
            indigo: {
                bg: 'bg-indigo-500/10',
                border: 'hover:border-indigo-500/30',
                hoverBg: 'hover:bg-indigo-500/[0.05]',
                text: 'text-indigo-500'
            },
            teal: {
                bg: 'bg-teal-500/10',
                border: 'hover:border-teal-500/30',
                hoverBg: 'hover:bg-teal-500/[0.05]',
                text: 'text-teal-500'
            },
            emerald: {
                bg: 'bg-emerald-500/10',
                border: 'hover:border-emerald-500/30',
                hoverBg: 'hover:bg-emerald-500/[0.05]',
                text: 'text-emerald-500'
            },
            amber: {
                bg: 'bg-amber-500/10',
                border: 'hover:border-amber-500/30',
                hoverBg: 'hover:bg-amber-500/[0.05]',
                text: 'text-amber-500'
            },
            orange: {
                bg: 'bg-orange-500/10',
                border: 'hover:border-orange-500/30',
                hoverBg: 'hover:bg-orange-500/[0.05]',
                text: 'text-orange-500'
            },
            rose: {
                bg: 'bg-rose-500/10',
                border: 'hover:border-rose-500/30',
                hoverBg: 'hover:bg-rose-500/[0.05]',
                text: 'text-rose-500'
            },
            violet: {
                bg: 'bg-violet-500/10',
                border: 'hover:border-violet-500/30',
                hoverBg: 'hover:bg-violet-500/[0.05]',
                text: 'text-violet-500'
            },
            yellow: {
                bg: 'bg-yellow-500/10',
                border: 'hover:border-yellow-500/30',
                hoverBg: 'hover:bg-yellow-500/[0.05]',
                text: 'text-yellow-500'
            },
            sky: {
                bg: 'bg-sky-500/10',
                border: 'hover:border-sky-500/30',
                hoverBg: 'hover:bg-sky-500/[0.05]',
                text: 'text-sky-500'
            },
            cyan: {
                bg: 'bg-cyan-500/10',
                border: 'hover:border-cyan-500/30',
                hoverBg: 'hover:bg-cyan-500/[0.05]',
                text: 'text-cyan-500'
            },
            gray: {
                bg: 'bg-gray-500/10',
                border: 'hover:border-gray-500/30',
                hoverBg: 'hover:bg-gray-500/[0.05]',
                text: 'text-gray-500'
            },
            slate: {
                bg: 'bg-slate-500/10',
                border: 'hover:border-slate-500/30',
                hoverBg: 'hover:bg-slate-500/[0.05]',
                text: 'text-slate-500'
            }
        };
        return maps[color] || maps.indigo;
    };

    const RenderType = ({ type, label, icon, color, desc, isSection = false }) => {
        const classes = getColorClasses(color);
        return (
            <div
                id={`palette-${type}`}
                className={`
                    group cursor-grab active:cursor-grabbing mb-2 p-3 rounded-2xl border transition-all duration-300
                    bg-white/[0.03] border-white/5 ${classes.border} ${classes.hoverBg}
                    flex items-center gap-3
                `}
                draggable
                onDragStart={(e) => handleDragStart(e, type)}
                title={desc}
            >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${classes.bg} ${classes.text} group-hover:scale-110 transition-transform`}>
                    <span className="text-[10px] font-bold">{icon}</span>
                </div>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    {label}
                </span>
                <div className="ml-auto opacity-0 group-hover:opacity-40 transition-opacity">
                    <span className="text-[10px]">⠿</span>
                </div>
            </div>
        );
    };

    return (
        <aside className="w-72 flex-shrink-0 p-4 sticky top-24 self-start">
            <div className="mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-4 px-2">
                    Layout Sections
                </h3>
                {SECTION_TYPES.map((t) => <RenderType key={t.type} {...t} isSection />)}
            </div>

            <div className="mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-4 px-2">
                    Input Fields
                </h3>
                <div className="grid grid-cols-1 gap-1">
                    {FIELD_TYPES.map((t) => <RenderType key={t.type} {...t} />)}
                </div>
            </div>

            <div className="mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-4 px-2">
                    Static Elements
                </h3>
                {STATIC_TYPES.map((t) => <RenderType key={t.type} {...t} />)}
            </div>

            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 mt-10">
                <p className="text-[10px] text-primary font-medium text-center leading-relaxed">
                    Tip: Drag elements onto the canvas or into groups to build your form logic.
                </p>
            </div>
        </aside>
    );
}
