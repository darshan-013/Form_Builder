import { useState, useEffect } from 'react';
import Navbar from '../../../components/Navbar';
import { getAllModules, createModule, updateModule } from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';

export default function ModuleManagerPage() {
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingModule, setEditingModule] = useState(null);

    const [formData, setFormData] = useState({
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

    useEffect(() => {
        fetchModules();
    }, []);

    const fetchModules = async () => {
        try {
            const data = await getAllModules();
            setModules(data || []);
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
            fetchModules();
        } catch (err) {
            toastError(err.message || 'Operation failed');
        }
    };

    const topLevelModules = modules.filter(m => !m.parent && !m.subParent);
    const subParentOptions = formData.parent 
        ? modules.filter(m => m.parent && m.parent.id == formData.parent && !m.subParent)
        : [];

    return (
        <div className="admin-layout">
            <Navbar />
            
            <main className="container">
                <header className="page-header">
                    <div className="header-text">
                        <h1>Module Management</h1>
                        <p>Define and organize dynamic sidebar menu items</p>
                    </div>
                    <button className="primary-btn" onClick={() => handleOpenModal()}>
                        <span>+</span> New Module
                    </button>
                </header>

                <div className="content-card">
                    {loading ? (
                        <div className="loader-container">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Module Name</th>
                                        <th>Prefix (Route)</th>
                                        <th>Hierarchy</th>
                                        <th>Status</th>
                                        <th className="actions-cell">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {modules.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="empty-state">No modules found. Create your first one!</td>
                                        </tr>
                                    ) : (
                                        modules.map(mod => (
                                            <tr key={mod.id}>
                                                <td>
                                                    <div className="module-info">
                                                        <span className="mod-icon">{mod.iconCss || '•'}</span>
                                                        <div className="mod-text">
                                                            <strong>{mod.moduleName}</strong>
                                                            <small>{mod.moduleDescription}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><code>{mod.prefix || '-'}</code></td>
                                                <td>
                                                    <div className="hierarchy-badges">
                                                        {mod.isParent && <span className="badge parent">Parent</span>}
                                                        {mod.isSubParent && <span className="badge sub">Sub-Parent</span>}
                                                        {!mod.parent && !mod.subParent && !mod.isParent && !mod.isSubParent && <span className="badge detail">Top Level</span>}
                                                        {mod.parent && <span className="badge detail">Child of {mod.parent.moduleName}</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${mod.active ? 'active' : 'inactive'}`}>
                                                        {mod.active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="actions-cell">
                                                    <button className="icon-btn edit" onClick={() => handleOpenModal(mod)} title="Edit">✎</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <header className="modal-header">
                            <h2>{editingModule ? 'Edit Module' : 'Create New Module'}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
                        </header>
                        <form onSubmit={handleSubmit}>
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
                                <div className="form-group full">
                                    <label>Description</label>
                                    <textarea 
                                        rows="2"
                                        placeholder="What does this module do?"
                                        value={formData.moduleDescription}
                                        onChange={e => setFormData({...formData, moduleDescription: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Icon CSS / Emoji</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. 📝 or icon-class"
                                        value={formData.iconCss}
                                        onChange={e => setFormData({...formData, iconCss: e.target.value})}
                                    />
                                </div>
                                <div className="form-group active-toggle">
                                    <label>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.isParent}
                                            onChange={e => setFormData({...formData, isParent: e.target.checked})}
                                        />
                                        Is Parent Flag
                                    </label>
                                </div>
                                <div className="form-group active-toggle">
                                    <label>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.isSubParent}
                                            onChange={e => setFormData({...formData, isSubParent: e.target.checked})}
                                        />
                                        Is Sub-Parent Flag
                                    </label>
                                </div>
                                <div className="form-group active-toggle">
                                    <label>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.active}
                                            onChange={e => setFormData({...formData, active: e.target.checked})}
                                        />
                                        Active
                                    </label>
                                </div>

                                <div className="divider full">Hierarchy (Optional)</div>

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

                            <footer className="modal-footer">
                                <button type="button" className="secondary-btn" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">
                                    {editingModule ? 'Save Changes' : 'Create Module'}
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

                /* Modal */
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 20px; }
                .modal-content { background: var(--bg-surface); width: 100%; max-width: 600px; border-radius: 24px; overflow: hidden; box-shadow: var(--shadow-xl); border: 1px solid var(--border); }
                .modal-header { padding: 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
                .modal-header h2 { font-size: 1.25rem; font-weight: 800; }
                .close-btn { background: none; border: none; font-size: 1.25rem; color: var(--text-muted); cursor: pointer; }
                
                form { padding: 24px; }
                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .form-group.full { grid-column: span 2; }
                .form-group label { display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }
                .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); transition: all 0.2s; }
                .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 4px var(--accent-soft); }
                
                .active-toggle { display: flex; align-items: center; gap: 8px; padding-top: 24px; }
                .active-toggle input { width: auto; }
                .divider.full { grid-column: span 2; font-size: 0.75rem; font-weight: 800; color: var(--accent); margin: 20px 0 10px; opacity: 0.6; display: flex; align-items: center; gap: 12px; }
                .divider.full::after { content: ''; flex: 1; height: 1px; background: var(--border); }

                .modal-footer { padding: 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 12px; background: rgba(0,0,0,0.02); }

                .loader-container { padding: 60px; display: flex; justify-content: center; }
                .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                
                .empty-state { text-align: center; color: var(--text-muted); padding: 60px !important; font-style: italic; }
            `}</style>
        </div>
    );
}
