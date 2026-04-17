import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useTheme } from "../context/ThemeContext";
import { 
    BookOpen, FileText, Code, Terminal, Send, ShieldCheck, Zap, AlertCircle, ChevronRight,
    Copy, Check, Type, Hash, Mail, Calendar, Phone, Clock, Link, CircleDot, CheckSquare,
    ListPlus, ToggleLeft, Heading, Pilcrow, Minus, Layout, SeparatorHorizontal, Menu, X, Globe,
    Search, RefreshCw, Lock, Activity, Users, Database, Layers, GitBranch, Key, Eye, Trash2,
    Play, Shield, Settings, Info, Square, Columns, Star, AlignLeft, Bot, History, BarChart3, Fingerprint, Bug,
    Sun, Moon, UserPlus, ArrowLeft
} from "lucide-react";

const DOCS_VERSION = "v1.5.0";

const FIELD_CATALOG = [
    {
        category: "Data Collection Fields",
        items: [
            { 
                label: "text", icon: AlignLeft, desc: "Single-line or multi-line text input for names, descriptions, or general strings.",
                validations: [
                    { rule: "minLength", desc: "Sets the minimum number of characters allowed." },
                    { rule: "maxLength", desc: "Sets the maximum number of characters allowed." },
                    { rule: "exactLength", desc: "Restricts input to an exact character count." },
                    { rule: "noLeadingTrailingSpaces", desc: "Trims and rejects whitespace at start/end." },
                    { rule: "noConsecutiveSpaces", desc: "Rejects input containing double spaces." },
                    { rule: "alphabetOnly", desc: "Restricts input to letters and spaces only." },
                    { rule: "alphanumericOnly", desc: "Allows only letters and numbers." },
                    { rule: "noSpecialCharacters", desc: "Blocks all symbols and special chars." },
                    { rule: "emailFormat", desc: "Enforces standard email address structure." },
                    { rule: "urlFormat", desc: "Enforces standard URL/Link structure." },
                    { rule: "passwordStrength", desc: "Requires uppercase, lowercase, digits, and symbols." },
                    { rule: "customRegex", desc: "Evaluates input against any custom regular expression." },
                    { rule: "unique", desc: "Ensures the value does not already exist in the database table." }
                ]
            },
            { 
                label: "number", icon: Hash, desc: "Numeric input for quantities, ages, or counts. Supports both integer and high-precision decimal values.",
                validations: [
                    { rule: "integerOnly", desc: "Blocks decimal values." },
                    { rule: "decimalAllowed", desc: "Ensures the field accepts floating point numbers." },
                    { rule: "maxDecimalPlaces", desc: "Controls precision (e.g. 2 for currency)." },
                    { rule: "currencyFormat", desc: "Formats and validates as monetary value (>=0, max 2 decimals)." },
                    { rule: "minValue / maxValue", desc: "Controls the numeric range limits." },
                    { rule: "positiveOnly", desc: "Only allows numbers greater than zero." },
                    { rule: "negativeAllowed", desc: "Toggle whether to allow negative signs." },
                    { rule: "maxDigits", desc: "Limits the number of digits in the integer part." },
                    { rule: "noLeadingZero", desc: "Blocks numbers starting with 0." },
                    { rule: "phoneNumberFormat", desc: "Strictly enforces 10-digit numeric sequences." },
                    { rule: "otpFormat", desc: "Restricts to specific digit lengths for verification." },
                    { rule: "ageValidation", desc: "Built-in check for values >= 18." },
                    { rule: "uniqueNumber", desc: "Ensures no duplicate numeric entries in the table." }
                ]
            },
            { 
                label: "date", icon: Calendar, desc: "Date selection tool.",
                validations: [
                    { rule: "customFormat", desc: "Switch between YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY." },
                    { rule: "minDate / maxDate", desc: "Restrict selection to a specific calendar range." },
                    { rule: "pastOnly / futureOnly", desc: "Limit selection relative to today's date." },
                    { rule: "noWeekend", desc: "Blocks Saturday and Sunday selections." },
                    { rule: "age18Plus", desc: "Calculates age from birthdate and requires >= 18." },
                    { rule: "notOlderThanXYears", desc: "Rejects dates too far in the past." }
                ]
            },
            { 
                label: "time", icon: Clock, desc: "Time picker for HH:mm format.",
                validations: [
                    { rule: "minTime / maxTime", desc: "Enforce a specific time window." },
                    { rule: "pastOnly / futureOnly", desc: "Limit selection relative to current system time." }
                ]
            },
            { 
                label: "date_time", icon: Calendar, desc: "Combined Date and Time selector.",
                validations: [
                    { rule: "minDateTime / maxDateTime", desc: "Absolute timestamp range enforcement." }
                ]
            },
            { 
                label: "boolean", icon: ToggleLeft, desc: "Toggle switch for binary choices.",
                validations: [
                    { rule: "mustBeTrue", desc: "Enforces a 'True' state (Terms of Service, etc.)." }
                ]
            },
            { 
                label: "dropdown", icon: ListPlus, desc: "Select one option from a list.",
                validations: [
                    { rule: "optionExists", desc: "Cross-checks the value against provided options." },
                    { rule: "defaultNotAllowed", desc: "Rejects selection of the default placeholder text." }
                ]
            },
            { 
                label: "radio", icon: CircleDot, desc: "Choose exactly one option from a visible list.",
                validations: [
                    { rule: "requireSelection", desc: "Ensures an option is selected before submission." },
                    { rule: "validateSelectedOption", desc: "Backend check that value belongs to the option set." }
                ]
            },
            { 
                label: "multiple_choice", icon: CheckSquare, desc: "Choose one or more options from a visible list.",
                validations: [
                    { rule: "requireSelection", desc: "Ensures at least one item is checked." },
                    { rule: "validateSelectedOption", desc: "Validates every checked item against the master list." }
                ]
            },
            { 
                label: "linear_scale", icon: Layout, desc: "Range selector between minimum and maximum points.",
                validations: [
                    { rule: "minScale / maxScale", desc: "Defines the start and end of the scale (e.g. 1-5)." }
                ]
            },
            { 
                label: "file", icon: Layout, desc: "Secure file upload support.",
                validations: [
                    { rule: "maxFileSize", desc: "Limits single file size in MB." },
                    { rule: "totalSizeLimit", desc: "Limits the combined size of all uploaded files." },
                    { rule: "allowedExtensions", desc: "Restricts to specific types (e.g. .pdf, .jpg)." },
                    { rule: "mimeTypeValidation", desc: "Strict system-level file type verification." },
                    { rule: "imageDimensionCheck", desc: "Validates width/height for uploaded images." },
                    { rule: "duplicateFilePrevention", desc: "Prevents uploading the same file multiple times." }
                ]
            },
            { 
                label: "multiple_choice_grid", icon: Columns, desc: "Matrix of radio choices (one per row).",
                validations: [
                    { rule: "eachRowRequired", desc: "Forces a selection for every single row in the grid." }
                ]
            },
            { 
                label: "checkbox_grid", icon: Columns, desc: "Matrix of checkbox choices (multi-select per row).",
                validations: [
                    { rule: "eachRowRequired", desc: "Ensures no row is left unanswered." },
                    { rule: "minPerRow / maxPerRow", desc: "Limits the count of checks per individual row." }
                ]
            },
            { 
                label: "star_rating", icon: Star, desc: "Interactive fixed 5-star rating component.",
                validations: null
            }
        ]
    },
    {
        category: "Structural Layout (Read-Only)",
        items: [
            { label: "field_group", icon: Columns, desc: "A visual container used to group multiple fields into a labeled section.", validations: null },
            { label: "section_header", icon: Heading, desc: "Large title for grouping related fields.", validations: null },
            { label: "label_text", icon: Type, desc: "Standard text labels for UI clarification.", validations: null },
            { label: "description_block", icon: Pilcrow, desc: "Multi-line descriptive text or instructions.", validations: null },
            { label: "page_break", icon: SeparatorHorizontal, desc: "Splits forms into multiple navigator steps.", validations: null }
        ]
    }
];

export default function DocsPage() {
    const { theme, toggleTheme } = useTheme();
    const [activeSection, setActiveSection] = useState("onboarding");
    const [selectedField, setSelectedField] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const isManualScrolling = useRef(false);

    const sections = [
        { id: "onboarding", label: "Jumpstart Guide", icon: Play },
        { id: "roles", label: "Roles & Personas", icon: Shield },
        { id: "fields", label: "Component Catalog", icon: ListPlus },
        { id: "states", label: "Form States", icon: Activity },
        { id: "versioning", label: "Versioning & Drift", icon: History },
        { id: "workflow", label: "Workflow Engine", icon: RefreshCw },
        { id: "submission", label: "Submissions API", icon: Send },
        { id: "rbac", label: "RBAC & Governance", icon: Users },
        { id: "menus", label: "Role-Menu Mapping", icon: Layout },
        { id: "ai", label: "AI Architect", icon: Bot },
        { id: "auditing", label: "Audit Logs", icon: Fingerprint },
        { id: "errors", label: "Error Handling", icon: Bug }
    ];

    const filteredSections = sections.filter(section => 
        section.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    useEffect(() => {
        const observerOptions = {
            root: null,
            rootMargin: '-20% 0px -70% 0px',
            threshold: 0
        };

        const observerCallback = (entries) => {
            if (isManualScrolling.current) return;
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    setActiveSection(entry.target.id);
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);
        sections.forEach(section => {
            const element = document.getElementById(section.id);
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, []);

    const scrollToSection = (id) => {
        const element = document.getElementById(id);
        if (element) {
            isManualScrolling.current = true;
            element.scrollIntoView({ behavior: "smooth" });
            setActiveSection(id);
            setIsMobileMenuOpen(false);
            setTimeout(() => {
                isManualScrolling.current = false;
            }, 800);
        }
    };

    const toggleFieldDetail = (item) => {
        if (selectedField?.label === item.label) {
            setSelectedField(null);
        } else {
            setSelectedField(item);
        }
    };

    return (
        <div className="docs-page-container">
            <Head>
                <title>API Documentation — FormCraft Architect</title>
            </Head>

            {/* Mobile Header */}
            <div className="lg:hidden" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '64px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        onClick={() => window.location.href = '/dashboard'}
                        style={{ background: 'var(--accent-soft)', border: 'none', color: 'var(--accent)', padding: '0.4rem', borderRadius: '8px', display: 'flex', alignItems: 'center' }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', background: 'var(--accent)', borderRadius: '8px', color: 'white' }}>
                            <Code size={18} />
                        </div>
                        <span style={{ fontWeight: 800 }}>API Docs</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={(e) => toggleTheme(e)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)' }}>
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Sidebar */}
            <aside className={`docs-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                    <div className="docs-brand" onClick={() => window.location.href = '/dashboard'} style={{ borderBottom: 'none', paddingBottom: 0 }}>
                        <div className="docs-brand-icon"><Activity size={20} /></div>
                        <div className="docs-brand-text"><h4>FormCraft</h4><span>Architect v1</span></div>
                    </div>
                    <button 
                        className="docs-theme-toggle"
                        onClick={(e) => toggleTheme(e)}
                        title={theme === 'dark' ? "Light Mode" : "Dark Mode"}
                        style={{ background: 'var(--accent-soft)', border: 'none', color: 'var(--accent)', padding: '0.6rem', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'var(--transition)' }}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>
                
                <button 
                    onClick={() => window.location.href = '/dashboard'}
                    className="docs-nav-item"
                    style={{ 
                        width: '100%', 
                        marginBottom: '1.5rem', 
                        justifyContent: 'center', 
                        background: 'var(--accent)', 
                        color: 'white',
                        fontWeight: 600,
                        boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)'
                    }}
                >
                    <Layout size={18} />
                    Go to Dashboard
                </button>

                <div className="docs-search-wrapper">
                    <Search className="docs-search-icon" size={16} />
                    <input type="text" placeholder="Search manual..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="docs-search-input" />
                </div>

                <div className="docs-nav-section">
                    <h5>Technical Guide</h5>
                    <nav className="docs-nav-list">
                        {filteredSections.map(section => (
                            <button key={section.id} onClick={() => scrollToSection(section.id)} className={`docs-nav-item ${activeSection === section.id ? "active" : ""}`}>
                                <section.icon size={18} />
                                {section.label}
                                {activeSection === section.id && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
                            </button>
                        ))}
                    </nav>
                </div>

                <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-lg)', color: 'white', marginTop: 'auto' }}>
                    <div style={{ marginBottom: '1rem', color: 'var(--accent)' }}><Terminal size={20} /></div>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 800 }}>Architect Reference</h4>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Enterprise form engine API.</p>
                    <span className="status-badge status-info">{DOCS_VERSION}</span>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="docs-main">
                
                {/* ── Jumpstart Guide ── */}
                <section id="onboarding" className="docs-section">
                    <div className="docs-badge"><Play size={12} /> Getting Started</div>
                    <h1 className="docs-title">Developer <span>Onboarding</span></h1>
                    <p className="docs-description">FormCraft uses a dynamic DDL engine to map JSON form definitions directly to physical PostgreSQL tables. This ensures maximum storage performance and data integrity.</p>

                    <div style={{ marginBottom: '4rem' }}>
                        <h3 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', marginBottom: '1.5rem' }}>The Mentality</h3>
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div className="docs-info-card" style={{ flex: 1, minWidth: '300px' }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><Database size={18} /> Physical Tables</h4>
                                <p style={{ fontSize: '0.85rem' }}>Every form has its own table (e.g. <code style={{ color: 'var(--accent)' }}>form_data_audit_2024</code>). This is NOT a "big table" architecture; it's a high-performance strictly-typed model.</p>
                            </div>
                            <div className="docs-info-card" style={{ flex: 1, minWidth: '300px' }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><Layers size={18} /> Metadata Sync</h4>
                                <p style={{ fontSize: '0.85rem' }}>The <code style={{ color: 'var(--accent)' }}>SchemaManager</code> ensures the database exactly matches your JSON definitions at all times.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Roles & Personas ── */}
                <section id="roles" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Shield size={12} /> Access Control</div>
                    <h2 style={{ fontSize: '2.5rem', fontFamily: 'Outfit' }}>System Roles</h2>
                    <p className="docs-description">RBAC is implemented at both the API and UI level. Here is the operational breakdown of each Persona.</p>
                    <div className="docs-card-grid">
                        {[
                            { role: "Admin", desc: "Global authority. Manages roles, users, and has full read/write access to all workspace forms.", color: "status-error" },
                            { role: "Builder", desc: "The Designer. Targets specific forms, manages drafts, initiates workflows, and performs peer reviews.", color: "status-success" },
                            { role: "Approver", desc: "Workflow reviewer. Authorized to approve or reject intermediate stages of a form's lifecycle.", color: "status-warning" },
                            { role: "Manager", desc: "Oversight role. Can initiate submissions and monitor the high-level listing of submissions.", color: "status-info" },
                            { role: "Viewer", desc: "Data entry specialist. Can create draft forms (assigned to builders) and initiate submissions.", color: "status-info" }
                        ].map(r => (
                            <div key={r.role} className="docs-info-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0 }}>{r.role}</h4>
                                    <span className={`status-badge ${r.color}`}>Role</span>
                                </div>
                                <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>{r.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Component Catalog ── */}
                <section id="fields" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><ListPlus size={12} /> Library</div>
                    <h2 style={{ fontSize: '2.5rem', fontFamily: 'Outfit' }}>Component Catalog</h2>
                    <p className="docs-description" style={{ marginBottom: '0.5rem' }}>All fields supported by the engine. Click any card to see its specific server-side validation rules.</p>
                    
                    {FIELD_CATALOG.map(cat => (
                        <div key={cat.category} style={{ marginTop: '2.5rem' }}>
                            <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>{cat.category}</h4>
                            <div className="docs-comp-grid">
                                {cat.items.map(item => (
                                    <div 
                                        key={item.label} 
                                        onClick={() => toggleFieldDetail(item)}
                                        className={`docs-comp-card ${selectedField?.label === item.label ? 'active' : ''}`}
                                    >
                                        <div className="docs-comp-icon"><item.icon size={18} /></div>
                                        <code className="docs-comp-name">{item.label}</code>
                                        <p className="docs-comp-desc">{item.desc}</p>
                                        {item.validations && (
                                            <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--accent)', opacity: 0.6 }}>
                                                <Settings size={12} />
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Validation Expansion Panel */}
                                {selectedField && cat.items.some(i => i.label === selectedField.label) && (
                                    <div className="validation-detail-panel">
                                        <div className="validation-header">
                                            <div style={{ padding: '0.5rem', background: 'var(--accent)', borderRadius: '8px', color: 'white' }}>
                                                <selectedField.icon size={20} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{selectedField.label} Rules</h3>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Enforced by ValidationService.java</span>
                                            </div>
                                            <button onClick={() => setSelectedField(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                <X size={20} />
                                            </button>
                                        </div>
                                        <div className="validation-rule-grid">
                                            {selectedField.validations ? selectedField.validations.map(v => (
                                                <div key={v.rule} className="validation-rule-item">
                                                    <code>{v.rule}</code>
                                                    <p>{v.desc}</p>
                                                </div>
                                            )) : (
                                                <div style={{ gridColumn: '1/-1', textAlign: 'center', opacity: 0.5, padding: '1rem' }}>Structural elements do not support server-side validation.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </section>

                {/* ── Form States ── */}
                <section id="states" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Activity size={12} /> Lifecycle</div>
                    <h2 className="docs-title">Form <span>States</span></h2>
                    <p className="docs-description">The operational status of a form determines its visibility, editability, and submission availability.</p>

                    <div className="docs-card-grid">
                        {[
                            { state: "DRAFT", icon: FileText, desc: "The default creation state. Builders can edit all fields, but the form cannot accept submissions.", color: "status-info" },
                            { state: "ASSIGNED", icon: UserPlus, desc: "Form has been assigned to a Builder for technical verification. Only visible to the owner and the assignee.", color: "status-info" },
                            { state: "PENDING_APPROVAL", icon: RefreshCw, desc: "Active workflow in progress. Form structure is locked until a decision is made.", color: "status-warning" },
                            { state: "REJECTED", icon: AlertCircle, desc: "Workflow was rejected. Returning to the Builder for core structural corrections.", color: "status-error" },
                            { state: "PUBLISHED", icon: Zap, desc: "Production-ready. Physical table mapping is live and submissions are fully enabled.", color: "status-success" },
                            { state: "ARCHIVED", icon: Trash2, desc: "Retired from production. Data persists for auditing but no new submissions are possible.", color: "status-error" }
                        ].map(s => (
                            <div key={s.state} className="docs-info-card">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div style={{ color: 'var(--accent)' }}><s.icon size={20} /></div>
                                    <h4 style={{ margin: 0 }}>{s.state}</h4>
                                    <span className={`status-badge ${s.color}`} style={{ marginLeft: 'auto' }}>Status</span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Versioning & Drift ── */}
                <section id="versioning" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><History size={12} /> Lifecycle</div>
                    <h2 className="docs-title">Versioning & <span>Drift</span></h2>
                    <p className="docs-description">FormCraft implements strict immutability for published versions to ensure historical data integrity.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
                        <div className="docs-info-card">
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><GitBranch size={16} /> Version Locking</h4>
                            <p style={{ fontSize: '0.85rem' }}>Once a form is <b>PUBLISHED</b>, its structure is locked. Any further edits generate a new <b>DRAFT</b> version, preventing accidental modification of active production tables.</p>
                        </div>
                        <div className="docs-info-card">
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={16} /> Drift Detection</h4>
                            <p style={{ fontSize: '0.85rem' }}>The <code style={{ color: 'var(--accent)' }}>SchemaManager</code> runs on every submission. If the physical PostgreSQL columns don't match the metadata, a <b>SCHEMA_DRIFT</b> error is thrown to protect data quality.</p>
                        </div>
                    </div>

                    <div className="docs-code-block">
                        <pre>{`GET /api/v1/forms/{id}/versions  // Returns version history
POST /api/v1/forms/{id}/publish  // Locks draft and creates table`}</pre>
                    </div>
                </section>

                {/* ── Workflow Engine ── */}
                <section id="workflow" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><RefreshCw size={12} /> Pipeline</div>
                    <h2 className="docs-title">Workflow <span>Engine</span></h2>
                    <p className="docs-description">Multi-stage approval routing for enterprise-grade form publishing.</p>

                    <div style={{ background: 'var(--bg-surface)', padding: '2rem', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', marginBottom: '2rem' }}>
                        <h4 style={{ marginBottom: '1.5rem', fontSize: '1rem' }}>Lifecycle States</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <span className="status-badge status-info">DRAFT</span>
                            <ChevronRight size={14} />
                            <span className="status-badge status-warning">PENDING_APPROVAL</span>
                            <ChevronRight size={14} />
                            <span className="status-badge status-success">PUBLISHED</span>
                            <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>|</span>
                            <span className="status-badge status-error">REJECTED</span>
                        </div>
                    </div>
                    <div className="workflow-visual">
                        <div className="workflow-visual-step">
                            <div className="workflow-visual-dot"></div>
                            <div className="workflow-visual-card">
                                <div className="workflow-visual-icon"><FileText size={18} /></div>
                                <div className="workflow-visual-info">
                                    <h4>Phase 1: Blueprint Initiation</h4>
                                    <p>Viewer or Builder creates the JSON schema. Status: <strong>DRAFT</strong></p>
                                </div>
                            </div>
                        </div>
                        <div className="workflow-visual-step">
                            <div className="workflow-visual-dot"></div>
                            <div className="workflow-visual-card">
                                <div className="workflow-visual-icon"><Send size={18} /></div>
                                <div className="workflow-visual-info">
                                    <h4>Phase 2: Authority Assignment</h4>
                                    <p>Form is assigned to a target Builder and intermediate Approvers.</p>
                                </div>
                            </div>
                        </div>
                        <div className="workflow-visual-step">
                            <div className="workflow-visual-dot"></div>
                            <div className="workflow-visual-card">
                                <div className="workflow-visual-icon"><ShieldCheck size={18} /></div>
                                <div className="workflow-visual-info">
                                    <h4>Phase 3: Sequential Review</h4>
                                    <p>N-Level chain of Managers/Approvers must verify the logic.</p>
                                </div>
                            </div>
                        </div>
                        <div className="workflow-visual-step">
                            <div className="workflow-visual-dot"></div>
                            <div className="workflow-visual-card" style={{ borderStyle: 'solid', borderColor: 'var(--success)' }}>
                                <div className="workflow-visual-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}><Zap size={18} /></div>
                                <div className="workflow-visual-info">
                                    <h4>Finalization: Live Deployment</h4>
                                    <p>Physical table migration & Locking. Status: <strong>PUBLISHED</strong></p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>The <code style={{ color: 'var(--accent)' }}>WorkflowService</code> supports <strong>Dynamic N-Level workflows</strong>, allowing for arbitrarily deep sequential approval chains involving multiple stakeholders before a form schema is finalized.</p>

                    <div className="docs-card-grid" style={{ marginTop: '0', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                        <div className="docs-info-card" style={{ padding: '1.5rem' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>Level 1: Verification</h5>
                            <p style={{ fontSize: '0.8rem' }}>Initial peer review by a <strong>Builder</strong> to ensure technical schema accuracy.</p>
                        </div>
                        <div className="docs-info-card" style={{ padding: '1.5rem' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>Level 2: Governance</h5>
                            <p style={{ fontSize: '0.8rem' }}>Business logic validation by <strong>Managers</strong> or <strong>Approvers</strong>.</p>
                        </div>
                        <div className="docs-info-card" style={{ padding: '1.5rem' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>Level N: Sign-off</h5>
                            <p style={{ fontSize: '0.8rem' }}>Final environmental locking and physical table migration in the database.</p>
                        </div>
                    </div>
                </section>

                {/* ── Submissions API ── */}
                <section id="submission" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Send size={12} /> Runtime</div>
                    <h2 className="docs-title">Submissions <span>API</span></h2>
                    <p className="docs-description">The primary endpoint for capturing data into your dynamic physical tables.</p>

                    <div className="docs-api-container">
                        <div className="docs-api-header">
                            <span className="method-tag" style={{ background: '#7c3aed' }}>POST</span>
                            <code className="method-path">/api/v1/runtime/forms/&#123;idOrCode&#125;/submit</code>
                        </div>
                        <div className="docs-api-body">
                            <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Submits data for a specific form. The system automatically resolves whether to use the ID or the unique Form Code.</p>
                            <div className="docs-code-block">
                                <pre>{`{
  "full_name": "Jane Doe",
  "employee_id": 44521,
  "birth_date": "1992-05-14"
}`}</pre>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── RBAC & Governance ── */}
                <section id="rbac" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Users size={12} /> Governance</div>
                    <h2 className="docs-title">RBAC & <span>Security</span></h2>
                    <p className="docs-description">Permission-based access control protecting form structures and submission data.</p>
                    
                    <table className="docs-table">
                        <thead>
                            <tr><th>Capability</th><th>Admin</th><th>Builder</th><th>Viewer</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Create Form Blueprints</td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td></tr>
                            <tr><td>Publish Forms</td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                            <tr><td>View All Submissions</td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                            <tr><td>Access Audit Logs</td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                        </tbody>
                    </table>
                </section>

                {/* ── Role-Menu Mapping ── */}
                <section id="menus" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Layout size={12} /> Navigation</div>
                    <h2 className="docs-title">Role-Menu <span>Mapping</span></h2>
                    <p className="docs-description">Dynamic sidebar generation based on active roles and system permissions.</p>

                    <table className="docs-table">
                        <thead>
                            <tr><th>Menu Item</th><th>Admin</th><th>Builder</th><th>Manager</th><th>Viewer</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Dashboard / Vault</td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td></tr>
                            <tr><td>Users & Roles</td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                            <tr><td>Approval Inbox</td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                            <tr><td>Workflow Status</td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td><td><Check size={14} color="var(--success)" /></td></tr>
                            <tr><td>Audit Trails</td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                            <tr><td>System Configuration</td><td><Check size={14} color="var(--success)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td><td><X size={14} color="var(--error)" /></td></tr>
                        </tbody>
                    </table>

                    <div className="docs-info-card">
                        <p style={{ fontSize: '0.8rem', margin: 0 }}><strong>Note:</strong> The <code style={{ color: 'var(--accent)' }}>MenuService</code> performs hierarchical permission resolution. If a user is assigned multiple roles, their menu is an additive union of all permitted modules.</p>
                    </div>
                </section>

                {/* ── AI Architect ── */}
                <section id="ai" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Bot size={12} /> Intelligence</div>
                    <h2 className="docs-title">AI <span>Architect</span></h2>
                    <p className="docs-description">Generative AI module that translates requirements into validated JSON form schemas.</p>

                    <div className="docs-info-card" style={{ background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(0, 0, 0, 0) 100%)' }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={16} color="var(--accent)" /> Prompt Engineering</h4>
                        <p style={{ fontSize: '0.85rem' }}>The <code style={{ color: 'var(--accent)' }}>AiArchitectService</code> uses Groq Llama-3 to parse natural language (e.g., *"Create an equipment checkout form with serial number and return date"*) into a compliant structural blueprint.</p>
                    </div>
                </section>

                {/* ── Audit Logs ── */}
                <section id="auditing" className="scroll-mt-32 docs-section">
                    <div className="docs-badge"><Fingerprint size={12} /> Traceability</div>
                    <h2 className="docs-title">Audit <span>Logs</span></h2>
                    <p className="docs-description">Centralized logging of every mutation performed across the platform.</p>
                    
                    <div className="docs-data-list">
                        <div className="docs-data-item"><span>Actions Tracked</span><span>Logins, Role Changes, Form Creations, and Workflow Approvals.</span></div>
                        <div className="docs-data-item"><span>Storage</span><span>Audit data is persisted in a separate, append-only log store.</span></div>
                        <div className="docs-data-item"><span>Visibility</span><span>Accessible only to users with the <code style={{ color: 'var(--accent)' }}>AUDIT</code> permission.</span></div>
                    </div>
                </section>

                {/* ── Error Handling ── */}
                <section id="errors" className="scroll-mt-32 docs-section" style={{ paddingBottom: '10rem' }}>
                    <div className="docs-badge"><Bug size={12} /> Debugging</div>
                    <h2 className="docs-title">Standard <span>Errors</span></h2>
                    <p className="docs-description">Common exception codes returned by the <code style={{ color: 'var(--accent)' }}>GlobalExceptionHandler</code>.</p>
                    
                    <div className="docs-card-grid">
                        <div className="docs-info-card">
                            <code>409 SCHEMA_DRIFT</code>
                            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>The database table has been manually altered and no longer matches metadata.</p>
                        </div>
                        <div className="docs-info-card">
                            <code>440 FORM_LOCKED</code>
                            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>The form is currently in an active workflow and cannot be edited.</p>
                        </div>
                        <div className="docs-info-card">
                            <code>401 UNAUTHORIZED</code>
                            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Session has expired or JSESSIONID cookie is missing.</p>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
}
