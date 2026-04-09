import { useState, useEffect } from 'react';
import Navbar from '../../../components/Navbar';
import PaginationControls from '../../../components/PaginationControls';
import { getAllModules, createModule, updateModule } from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';

export default function ModuleManagerPage() {
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(10);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingModule, setEditingModule] = useState(null);

    const [formData, setFormData] = useState({
        moduleName: '',
        moduleDescription: '',
        prefix: '',
        iconCss: '📝', // Default icon
        isParent: false,
        isSubParent: false,
        active: true,
        parent: null,
        subParent: null
    });

    // List of common icons for easy selection
    const commonIcons = [
        '🏠', '👥', '🛡️', '⚙️', '📊', '📝', '📅', '📩', '📁', '🧩', 
        '🔒', '🔔', '📈', '🌐', '💻', '📱', '🔧', '📦', '🛒', '💳',
        '⭐', '🔥', '💡', '🧪', '🏹', '🎨', '🚀', '🛠️', '🧭', '🔗'
    ];

    useEffect(() => {
        fetchModules(0, size);
    }, []);

    const fetchModules = async (nextPage = page, nextSize = size) => {
        setLoading(true);
        try {
            const data = await getAllModules({ page: nextPage, size: nextSize });
            const content = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : []);
            setModules(content || []);
            setPage(Array.isArray(data) ? nextPage : Number(data?.page ?? nextPage));
            setSize(Array.isArray(data) ? nextSize : Number(data?.size ?? nextSize));
            setTotalElements(Array.isArray(data) ? content.length : Number(data?.totalElements ?? content.length));
            setTotalPages(Array.isArray(data) ? (content.length > 0 ? 1 : 0) : Number(data?.totalPages ?? 0));
        } catch (err) {
            toastError('Failed to fetch modules');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (mod = null) => {
        if (mod) {
            setEditingModule(mod);
            setFormData({
                moduleName: mod.moduleName,
                moduleDescription: mod.moduleDescription || '',
                prefix: mod.prefix || '',
                iconCss: mod.iconCss || '',
                isParent: mod.isParent || false,
                isSubParent: mod.isSubParent || false,
                active: mod.active !== false,
                parent: mod.parent ? mod.parent.id : null,
                subParent: mod.subParent ? mod.subParent.id : null
            });
        } else {
            setEditingModule(null);
            setFormData({
                moduleName: '',
                moduleDescription: '',
                prefix: '',
                iconCss: '',
                isParent: false,
                isSubParent: false,
                active: true,
                parent: null,
                subParent: null
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                parent: formData.parent ? { id: formData.parent } : null,
                subParent: formData.subParent ? { id: formData.subParent } : null
            };

            if (editingModule) {
                await updateModule(editingModule.id, payload);
                toastSuccess('Module updated successfully');
            } else {
                await createModule(payload);
                toastSuccess('Module created successfully');
            }
            setIsModalOpen(false);
            await fetchModules(page, size);
        } catch (err) {
            toastError(err.message || 'Operation failed');
        }
    };

    const nestModules = (mods) => {
        const sorted = [];
        const l1 = mods.filter(m => !m.parent && !m.subParent);
        
        l1.forEach(p => {
            sorted.push({ ...p, depth: 0 });
            const l2 = mods.filter(m => m.parent?.id === p.id && !m.subParent);
            l2.forEach(sp => {
                sorted.push({ ...sp, depth: 1 });
                const l3 = mods.filter(m => m.subParent?.id === sp.id);
                l3.forEach(c => {
                    sorted.push({ ...c, depth: 2 });
                });
            });
        });

        const sortedIds = new Set(sorted.map(m => m.id));
        mods.filter(m => !sortedIds.has(m.id)).forEach(m => {
            sorted.push({ ...m, depth: 0 });
        });

        return sorted;
    };

    const nestedModules = nestModules(modules);
    const topLevelModules = modules.filter(m => !m.parent && !m.subParent);
    const subParentOptions = formData.parent 
        ? modules.filter(m => m.parent && m.parent.id == formData.parent && !m.subParent)
        : [];

    return (
        <div className="admin-layout">
            <Navbar />
            
            <main className="container">
                <header className="page-header animate-slide-up">
                    <div className="header-text">
                        <h1>Module Management</h1>
                        <p>Define and organize dynamic sidebar menu items</p>
                    </div>
                    <button className="primary-btn hover-premium" onClick={() => handleOpenModal()}>
                        <span>+</span> New Module
                    </button>
                </header>

                <div className="content-card">
                    {loading ? (
                        <div className="loader-container">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <div className="table-wrapper animate-fade-in">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Module Name</th>
                                        <th>Prefix (Route)</th>
                                        <th>Level</th>
                                        <th>Status</th>
                                        <th className="actions-cell">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {nestedModules.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="empty-state">No modules found. Create your first one!</td>
                                        </tr>
                                    ) : (
                                        nestedModules.map((mod, idx) => (
                                            <tr 
                                                key={mod.id} 
                                                className={`depth-${mod.depth} animate-fade-in stagger-item`}
                                                style={{ animationDelay: `${idx * 0.04}s` }}
                                            >
                                                <td>
                                                    <div className="module-info" style={{ paddingLeft: mod.depth * 32 + 'px' }}>
                                                        {mod.depth > 0 && <span className="nest-indicator">{mod.depth === 2 ? '└─ └─' : '└─'}</span>}
                                                        <span className="mod-icon animate-scale-in">{mod.iconCss || '•'}</span>
                                                        <div className="mod-text">
                                                            <strong>{mod.moduleName}</strong>
                                                            <small>{mod.moduleDescription}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><code>{mod.prefix || '-'}</code></td>
                                                <td>
                                                    <div className="hierarchy-badges">
                                                        {mod.depth === 0 && <span className="badge parent">L1: Parent</span>}
                                                        {mod.depth === 1 && <span className="badge sub">L2: Child</span>}
                                                        {mod.depth === 2 && <span className="badge detail">L3: Grandchild</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${mod.active ? 'active' : 'inactive'}`}>
                                                        {mod.active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="actions-cell">
                                                    <button className="icon-btn edit hover-premium" onClick={() => handleOpenModal(mod)} title="Edit">✎</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div style={{ padding: '0 24px 20px' }}>
                        <PaginationControls
                            page={page}
                            size={size}
                            totalElements={totalElements}
                            totalPages={totalPages}
                            loading={loading}
                            onPageChange={(nextPage) => fetchModules(nextPage, size)}
                            onSizeChange={(nextSize) => fetchModules(0, nextSize)}
                        />
                    </div>
                </div>
            </main>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content glass-v4">
                        <header className="modal-header">
                            <div className="header-info">
                                <h2>{editingModule ? 'Edit Module' : 'Create New Module'}</h2>
                                <p>{editingModule ? 'Update existing module configuration' : 'Configure a new feature for the sidebar'}</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
                        </header>
                        <form onSubmit={handleSubmit} className="module-form">
                            <div className="form-sections">
                                {/* Section 1: Identity */}
                                <div className="form-section">
                                    <h3 className="section-subtitle">Identity & Route</h3>
                                    <div className="form-grid">
                                        <div className="form-group">
                                            <label>Module Name</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. Create Form"
                                                required 
                                                value={formData.moduleName}
                                                onChange={e => setFormData({...formData, moduleName: e.target.value})}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Route Prefix</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. /forms/create"
                                                value={formData.prefix}
                                                onChange={e => setFormData({...formData, prefix: e.target.value})}
                                            />
                                        </div>
                                        <div className="form-group icon-picker-group">
                                            <label>Icon Selection</label>
                                            <div className="icon-selector-container">
                                                <input 
                                                    type="text" 
                                                    placeholder="Selected Icon or Custom CSS"
                                                    value={formData.iconCss}
                                                    onChange={e => setFormData({...formData, iconCss: e.target.value})}
                                                    className="icon-input-mirror"
                                                />
                                                <div className="icon-selection-grid">
                                                    {commonIcons.map(icon => (
                                                        <button 
                                                            key={icon}
                                                            type="button"
                                                            className={`selectable-icon ${formData.iconCss === icon ? 'selected' : ''}`}
                                                            onClick={() => setFormData({...formData, iconCss: icon})}
                                                            title={icon}
                                                        >
                                                            {icon}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Description (Optional)</label>
                                            <input 
                                                type="text"
                                                placeholder="What does this module do?"
                                                value={formData.moduleDescription}
                                                onChange={e => setFormData({...formData, moduleDescription: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Hierarchy */}
                                <div className="form-section">
                                    <h3 className="section-subtitle">Hierarchy & Placement</h3>
                                    <div className="form-grid">
                                        <div className="form-group">
                                            <label>Parent Module</label>
                                            <select 
                                                value={formData.parent || ''}
                                                onChange={e => setFormData({...formData, parent: e.target.value || null, subParent: null})}
                                            >
                                                <option value="">None (Top Level)</option>
                                                {topLevelModules.filter(m => m.id !== editingModule?.id).map(m => (
                                                    <option key={m.id} value={m.id}>{m.moduleName}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Sub-Parent Module</label>
                                            <select 
                                                disabled={!formData.parent}
                                                value={formData.subParent || ''}
                                                onChange={e => setFormData({...formData, subParent: e.target.value || null})}
                                            >
                                                <option value="">None</option>
                                                {subParentOptions.filter(m => m.id !== editingModule?.id).map(m => (
                                                    <option key={m.id} value={m.id}>{m.moduleName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Flags */}
                                <div className="form-section last">
                                    <h3 className="section-subtitle">Behavior & Status</h3>
                                    <div className="switches-grid">
                                        <div className="switch-group">
                                            <label className="switch">
                                                <input 
                                                    type="checkbox" 
                                                    checked={formData.isParent}
                                                    onChange={e => setFormData({...formData, isParent: e.target.checked})}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                            <div className="switch-text">
                                                <span>Has Children (L1)</span>
                                                <small>Enable to allow children under this module</small>
                                            </div>
                                        </div>
                                        <div className="switch-group">
                                            <label className="switch">
                                                <input 
                                                    type="checkbox" 
                                                    checked={formData.isSubParent}
                                                    onChange={e => setFormData({...formData, isSubParent: e.target.checked})}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                            <div className="switch-text">
                                                <span>Has Grandchildren (L2)</span>
                                                <small>Enable to allow sub-levels</small>
                                            </div>
                                        </div>
                                        <div className="switch-group">
                                            <label className="switch">
                                                <input 
                                                    type="checkbox" 
                                                    checked={formData.active}
                                                    onChange={e => setFormData({...formData, active: e.target.checked})}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                            <div className="switch-text">
                                                <span>Enabled / Active</span>
                                                <small>Global visibility toggle</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <footer className="modal-footer">
                                <button type="button" className="secondary-btn" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="primary-btn wide shadow-glow">
                                    {editingModule ? 'Update Module' : 'Create Module'}
                                </button>
                            </footer>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
                .admin-layout { background: var(--bg-main); min-height: 100vh; color: var(--text-primary); }
                .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
                
                .page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
                .header-text h1 { font-size: 2.25rem; font-weight: 800; margin-bottom: 8px; background: linear-gradient(135deg, var(--accent) 0%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .header-text p { color: var(--text-muted); font-size: 1.1rem; }

                .content-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-sm); }
                .table-wrapper { overflow-x: auto; }
                
                .admin-table { width: 100%; border-collapse: collapse; text-align: left; }
                .admin-table th { background: rgba(0,0,0,0.02); padding: 16px 24px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); border-bottom: 1px solid var(--border); }
                .admin-table td { padding: 20px 24px; border-bottom: 1px solid var(--border); vertical-align: middle; }
                .admin-table tr:last-child td { border-bottom: none; }
                
                .module-info { display: flex; align-items: center; gap: 16px; }
                .mod-icon { font-size: 1.5rem; width: 40px; height: 40px; background: var(--bg-card); display: flex; align-items: center; justify-content: center; border-radius: 12px; border: 1px solid var(--border); }
                .mod-text { display: flex; flex-direction: column; }
                .mod-text strong { font-size: 1rem; color: var(--text-primary); }
                .mod-text small { font-size: 0.8rem; color: var(--text-muted); }

                .nest-indicator { color: var(--accent); font-family: monospace; font-weight: bold; margin-right: 8px; opacity: 0.7; white-space: nowrap; }

                .hierarchy-badges { display: flex; gap: 4px; }
                .badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
                .badge.parent { background: rgba(99, 102, 241, 0.1); color: var(--accent); }
                .badge.sub { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .badge.detail { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

                .status-pill { font-size: 0.75rem; padding: 4px 12px; border-radius: 20px; font-weight: 700; }
                .status-pill.active { background: rgba(16, 185, 129, 0.15); color: #10b981; }
                .status-pill.inactive { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

                .actions-cell { text-align: right; }
                .icon-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted); transition: all 0.2s; padding: 8px; border-radius: 8px; }
                .icon-btn.edit:hover { background: var(--accent-soft); color: var(--accent); }

                /* Buttons */
                .primary-btn { background: var(--accent); color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
                .primary-btn:hover { background: #4f46e5; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
                .secondary-btn { background: none; border: 1px solid var(--border); color: var(--text-primary); padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; }
                .secondary-btn:hover { background: var(--bg-card-hover); }

                /* Modal Improvements */
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 20px; animation: fadeIn 0.3s ease; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

                .modal-content { background: var(--bg-surface); width: 100%; max-width: 650px; border-radius: 28px; overflow: hidden; box-shadow: var(--shadow-xl); border: 1px solid var(--border); animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

                .glass-v4 { background: rgba(var(--bg-card-rgb, 20, 20, 25), 0.7) !important; backdrop-filter: blur(25px) saturate(180%); border: 1px solid rgba(255,255,255,0.08) !important; }

                /* Icon Picker Styles */
                .icon-picker-group { grid-column: span 2; }
                .icon-selector-container { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
                .icon-input-mirror { background: rgba(0,0,0,0.2) !important; border: 1px dashed var(--border) !important; font-size: 1.1rem; text-align: center; font-weight: 700; color: var(--accent); }
                .icon-selection-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); 
                    gap: 8px; 
                    padding: 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 16px;
                    border: 1px solid var(--border);
                    max-height: 140px;
                    overflow-y: auto;
                    scrollbar-width: thin;
                }
                .selectable-icon {
                    aspect-ratio: 1;
                    font-size: 1.25rem;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .selectable-icon:hover {
                    background: rgba(255, 255, 255, 0.08);
                    transform: scale(1.15);
                    border-color: rgba(255, 255, 255, 0.1);
                }
                .selectable-icon.selected {
                    background: var(--accent-soft);
                    border-color: var(--accent);
                    color: white;
                    box-shadow: 0 0 15px rgba(99, 102, 241, 0.3);
                }

                .modal-header { padding: 32px 32px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start; }
                .header-info h2 { font-size: 1.5rem; font-weight: 800; margin-bottom: 4px; background: linear-gradient(135deg, #fff 0%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .header-info p { color: var(--text-muted); font-size: 0.9rem; }
                .close-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: 32px; height: 32px; border-radius: 50%; color: var(--text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
                .close-btn:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
                
                .module-form { padding: 0; }
                .form-sections { padding: 0 32px; max-height: 60vh; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--accent) transparent; }
                .form-section { padding: 24px 0; border-bottom: 1px solid var(--border); }
                .form-section.last { border-bottom: none; }
                .section-subtitle { font-size: 0.75rem; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 20px; }

                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .form-group label { display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }
                .form-group input, .form-group select { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--text-primary); transition: all 0.2s; font-size: 0.95rem; }
                .form-group input:focus, .form-group select:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 4px var(--accent-soft); background: rgba(255,255,255,0.05); }
                
                /* Switch Styles */
                .switches-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
                .switch-group { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid var(--border); transition: all 0.2s; }
                .switch-group:hover { background: rgba(255,255,255,0.04); border-color: var(--accent-soft); }
                
                .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.1); transition: .4s; border-radius: 24px; border: 1px solid var(--border); }
                .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                input:checked + .slider { background-color: var(--accent); border-color: var(--accent); }
                input:focus + .slider { box-shadow: 0 0 1px var(--accent); }
                input:checked + .slider:before { transform: translateX(20px); }

                .switch-text { display: flex; flex-direction: column; }
                .switch-text span { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
                .switch-text small { font-size: 0.8rem; color: var(--text-muted); }

                .modal-footer { padding: 24px 32px 32px; display: flex; justify-content: flex-end; gap: 16px; background: rgba(0,0,0,0.05); }
                .primary-btn.wide { padding-left: 40px; padding-right: 40px; }
                .shadow-glow { box-shadow: 0 0 20px var(--accent-soft); }

                :global([data-theme="light"]) .glass-v4 { background: rgba(255,255,255,0.85) !important; }
                :global([data-theme="light"]) .form-group input, :global([data-theme="light"]) .form-group select { background: #fff; }
                :global([data-theme="light"]) .section-subtitle { opacity: 0.8; }
                :global([data-theme="light"]) .header-info h2 { background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent) 100%); -webkit-background-clip: text; }
            `}</style>
        </div>
    );
}
