import { useState, useEffect } from 'react';
import Navbar from '../../../components/Navbar';
import { getRoles, getAllModules, getModulesByRole, assignModulesToRole } from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';

export default function RoleModuleMappingPage() {
    const [roles, setRoles] = useState([]);
    const [modules, setModules] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [mappedModuleIds, setMappedModuleIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [rolesData, modulesData] = await Promise.all([
                getRoles(),
                getAllModules()
            ]);
            setRoles(rolesData || []);
            setModules(modulesData || []);
        } catch (err) {
            toastError('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (roleId) => {
        if (!roleId) {
            setSelectedRole(null);
            setMappedModuleIds([]);
            return;
        }

        const role = roles.find(r => r.id == roleId);
        setSelectedRole(role);
        setLoading(true);

        try {
            const mapped = await getModulesByRole(roleId);
            setMappedModuleIds(mapped.map(rm => rm.module.id));
        } catch (err) {
            toastError('Failed to fetch mappings');
        } finally {
            setLoading(false);
        }
    };

    const toggleModule = (moduleId) => {
        setMappedModuleIds(prev => 
            prev.includes(moduleId) 
                ? prev.filter(id => id !== moduleId) 
                : [...prev, moduleId]
        );
    };

    const handleSave = async () => {
        if (!selectedRole) return;
        setSaving(true);
        try {
            await assignModulesToRole(selectedRole.id, mappedModuleIds);
            toastSuccess('Mappings saved successfully');
        } catch (err) {
            toastError('Failed to save mappings');
        } finally {
            setSaving(false);
        }
    };

    // Build hierarchy for display
    const topLevel = modules.filter(m => !m.parent && !m.subParent);
    const getSubParents = (parentId) => modules.filter(m => m.parent?.id === parentId && !m.subParent);
    const getSubs = (subParentId) => modules.filter(m => m.subParent?.id === subParentId);

    return (
        <div className="admin-layout">
            <Navbar />

            <main className="container">
                <header className="page-header">
                    <div className="header-text">
                        <h1>Role-Menu Mapping</h1>
                        <p>Control feature visibility for different user roles</p>
                    </div>
                </header>

                <div className="mapping-grid">
                    <section className="role-sidebar">
                        <div className="content-card">
                            <div className="card-header">Select a Role</div>
                            <div className="role-list">
                                {roles.map(role => (
                                    <div 
                                        key={role.id} 
                                        className={`role-item ${selectedRole?.id === role.id ? 'active' : ''}`}
                                        onClick={() => handleRoleChange(role.id)}
                                    >
                                        <span className="role-name">{role.roleName}</span>
                                        <span className="arrow">→</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="modules-panel">
                        {loading ? (
                            <div className="panel-loading">
                                <div className="spinner"></div>
                                <p>Loading modules...</p>
                            </div>
                        ) : !selectedRole ? (
                            <div className="empty-selection">
                                <div className="icon">🛡️</div>
                                <h2>No Role Selected</h2>
                                <p>Select a role from the left to start mapping modules.</p>
                            </div>
                        ) : (
                            <div className="content-card">
                                <div className="card-header sticky">
                                    <span>Mapping for: <strong>{selectedRole.roleName}</strong></span>
                                    <button 
                                        className="primary-btn sm" 
                                        disabled={saving} 
                                        onClick={handleSave}
                                    >
                                        {saving ? 'Saving...' : 'Save Mappings'}
                                    </button>
                                </div>
                                <div className="modules-tree">
                                    {topLevel.length === 0 ? (
                                        <p className="no-data">No dynamic modules defined yet.</p>
                                    ) : (
                                        topLevel.map(m => (
                                            <div key={m.id} className="module-group">
                                                <label className="checkbox-item parent">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={mappedModuleIds.includes(m.id)}
                                                        onChange={() => toggleModule(m.id)}
                                                    />
                                                    <span className="label-text">
                                                        <span className="icon">{m.iconCss || '•'}</span> {m.moduleName}
                                                    </span>
                                                </label>

                                                {/* Sub Parents */}
                                                <div className="children-container">
                                                    {getSubParents(m.id).map(sp => (
                                                        <div key={sp.id} className="sub-group">
                                                            <label className="checkbox-item sub-parent">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={mappedModuleIds.includes(sp.id)}
                                                                    onChange={() => toggleModule(sp.id)}
                                                                />
                                                                <span className="label-text">
                                                                    <span className="icon">{sp.iconCss || '•'}</span> {sp.moduleName}
                                                                </span>
                                                            </label>

                                                            {/* Actual Subs */}
                                                            <div className="children-container">
                                                                {getSubs(sp.id).map(s => (
                                                                    <label key={s.id} className="checkbox-item child">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={mappedModuleIds.includes(s.id)}
                                                                            onChange={() => toggleModule(s.id)}
                                                                        />
                                                                        <span className="label-text">
                                                                            <span className="icon">{s.iconCss || '•'}</span> {s.moduleName}
                                                                        </span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </main>

            <style jsx>{`
                .admin-layout { background: var(--bg-main); min-height: 100vh; color: var(--text-primary); }
                .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
                
                .page-header { margin-bottom: 32px; }
                .header-text h1 { font-size: 2.25rem; font-weight: 800; margin-bottom: 8px; background: linear-gradient(135deg, var(--accent) 0%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .header-text p { color: var(--text-muted); font-size: 1.1rem; }

                .mapping-grid { display: grid; grid-template-columns: 320px 1fr; gap: 32px; align-items: start; }
                
                .content-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; }
                .card-header { padding: 16px 24px; background: rgba(0,0,0,0.02); border-bottom: 1px solid var(--border); font-size: 0.85rem; font-weight: 700; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; }
                .card-header.sticky { position: sticky; top: 0; background: var(--bg-surface); z-index: 10; opacity: 0.98; backdrop-filter: blur(8px); }
                
                .role-list { padding: 8px; }
                .role-item { 
                    padding: 12px 16px; 
                    border-radius: 12px; 
                    cursor: pointer; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                    transition: all 0.2s;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }
                .role-item:hover { background: var(--bg-card-hover); color: var(--text-primary); }
                .role-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 700; }
                .role-item.active .arrow { transform: translateX(4px); opacity: 1; }
                .arrow { opacity: 0; transition: all 0.2s; }

                .modules-panel { min-height: 500px; }
                .panel-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 500px; gap: 16px; }
                .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }

                .empty-selection { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 500px; text-align: center; }
                .empty-selection .icon { font-size: 4rem; margin-bottom: 24px; opacity: 0.2; }
                .empty-selection h2 { font-size: 1.5rem; margin-bottom: 12px; color: var(--text-muted); }
                .empty-selection p { color: var(--text-muted); max-width: 300px; }

                .modules-tree { padding: 24px; max-height: 700px; overflow-y: auto; }
                .module-group { margin-bottom: 24px; padding: 16px; background: rgba(0,0,0,0.01); border-radius: 16px; border: 1px solid var(--border); }
                .children-container { padding-left: 32px; margin-top: 12px; display: flex; flex-direction: column; gap: 8px; border-left: 2px dashed var(--border); }

                .checkbox-item { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
                .checkbox-item:hover { background: rgba(0,0,0,0.02); }
                .checkbox-item input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent); }
                .label-text { font-size: 0.95rem; display: flex; align-items: center; gap: 8px; }
                .label-text .icon { font-size: 1.1rem; opacity: 0.7; }

                .parent { font-weight: 700; font-size: 1rem; color: var(--text-primary); }
                .sub-parent { font-weight: 600; color: var(--text-secondary); }
                .child { font-size: 0.9rem; color: var(--text-muted); }

                .primary-btn { background: var(--accent); color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
                .primary-btn.sm { padding: 8px 16px; font-size: 0.8rem; }
                .primary-btn:hover { background: #4f46e5; transform: translateY(-1px); }
                .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

                .no-data { text-align: center; color: var(--text-muted); font-style: italic; padding: 40px; }
            `}</style>
        </div>
    );
}
