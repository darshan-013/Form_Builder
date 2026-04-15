import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Navbar from '../../../components/Navbar';
import WorkflowHeader from '../../../components/workflows/WorkflowHeader';
import WorkflowDiagram from '../../../components/workflows/WorkflowDiagram';
import { assignBuilder, getForm, getWorkflowCandidates, initiateWorkflow } from '../../../services/api';
import { toastError, toastSuccess } from '../../../services/toast';
import { useAuth } from '../../../context/AuthContext';

function displayUser(user) {
    if (!user) return 'Unassigned';
    return user.name ? `${user.name} (${user.username})` : user.username;
}

export default function CreateWorkflowPage() {
    const router = useRouter();
    const { id } = router.query;
    const { hasRole } = useAuth();

    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [builders, setBuilders] = useState([]);
    const [authorities, setAuthorities] = useState([]);

    const [strategy, setStrategy] = useState('NORMAL');
    const [targetBuilderId, setTargetBuilderId] = useState('');
    const [authority1, setAuthority1] = useState('');
    const [authority2, setAuthority2] = useState('');
    const [authority3, setAuthority3] = useState('');
    const [authority1Search, setAuthority1Search] = useState('');
    const [authority2Search, setAuthority2Search] = useState('');
    const [authority3Search, setAuthority3Search] = useState('');
    const [builderSearch, setBuilderSearch] = useState('');

    const isAdmin = hasRole('Admin');
    const isViewer = hasRole('Viewer');
    const isBuilder = hasRole('Builder');
    
    // Decoupled logic: 
    // - Assignment Mode is for Viewers/Admins when form is NOT yet assigned or was rejected.
    // - Initiation Mode (isAssignMode=false) is for the assigned Builder to pick levels.
    const isAssignMode = (isViewer || isAdmin) && (form?.status !== 'ASSIGNED');
    const viewerReassignBlocked = isViewer && !!form?.assignedBuilderId && form?.status !== 'REJECTED';

    useEffect(() => {
        if (!id) return;

        let mounted = true;
        Promise.all([getForm(id), getWorkflowCandidates()])
            .then(([formRes, candidateRes]) => {
                if (!mounted) return;
                setForm(formRes);
                setBuilders(Array.isArray(candidateRes?.builders) ? candidateRes.builders : []);
                setAuthorities(Array.isArray(candidateRes?.authorities) ? candidateRes.authorities : []);
                if (formRes?.assignedBuilderId) {
                    setTargetBuilderId(String(formRes.assignedBuilderId));
                }
            })
            .catch((err) => toastError(err.message || 'Failed to load workflow setup data.'))
            .finally(() => mounted && setLoading(false));

        return () => { mounted = false; };
    }, [id]);

    const requiredAuthorityCount = strategy === 'LEVEL_3' ? 3 : strategy === 'LEVEL_2' ? 2 : strategy === 'LEVEL_1' ? 1 : 0;

    const intermediateIds = useMemo(() => {
        const out = [];
        if (requiredAuthorityCount >= 1 && authority1) out.push(Number(authority1));
        if (requiredAuthorityCount >= 2 && authority2) out.push(Number(authority2));
        if (requiredAuthorityCount >= 3 && authority3) out.push(Number(authority3));
        return out;
    }, [authority1, authority2, authority3, requiredAuthorityCount]);

    const selectedUserIds = useMemo(() => {
        const out = new Set(intermediateIds);
        if (targetBuilderId) out.add(Number(targetBuilderId));
        return out;
    }, [intermediateIds, targetBuilderId]);

    const userById = useMemo(() => {
        const map = new Map();
        [...authorities, ...builders].forEach((u) => map.set(Number(u.id), u));
        return map;
    }, [authorities, builders]);

    const workflowSteps = useMemo(() => {
        if (isAssignMode) {
            return [
                { id: 'start', name: 'Start', icon: 'file', role: 'System', status: 'completed' },
                {
                    id: 'builder',
                    name: targetBuilderId ? displayUser(userById.get(Number(targetBuilderId))) : 'Assign Builder',
                    icon: 'builder',
                    role: 'Builder',
                    status: targetBuilderId ? 'completed' : 'active',
                },
                { id: 'end', name: 'End', icon: 'done', role: 'System', status: targetBuilderId ? 'completed' : 'pending' },
            ];
        }

        const nodes = [{ id: 'start', name: 'Start', icon: 'file', role: 'System', status: 'completed' }];
        if (requiredAuthorityCount >= 1) {
            nodes.push({
                id: 'authority1',
                name: authority1 ? displayUser(userById.get(Number(authority1))) : 'Authority 1',
                icon: 'manager',
                role: 'Approver',
                status: authority1 ? 'completed' : 'active',
            });
        }
        if (requiredAuthorityCount >= 2) {
            nodes.push({
                id: 'authority2',
                name: authority2 ? displayUser(userById.get(Number(authority2))) : 'Authority 2',
                icon: 'manager',
                role: 'Approver',
                status: authority2 ? 'completed' : (authority1 ? 'active' : 'pending'),
            });
        }
        if (requiredAuthorityCount >= 3) {
            nodes.push({
                id: 'authority3',
                name: authority3 ? displayUser(userById.get(Number(authority3))) : 'Authority 3',
                icon: 'manager',
                role: 'Approver',
                status: authority3 ? 'completed' : (authority2 ? 'active' : 'pending'),
            });
        }

        nodes.push({
            id: 'builder',
            name: targetBuilderId ? displayUser(userById.get(Number(targetBuilderId))) : 'Target Builder',
            icon: 'builder',
            role: 'Builder',
            status: targetBuilderId ? 'completed' : 'pending',
        });

        nodes.push({
            id: 'end',
            name: 'End',
            icon: 'done',
            role: 'System',
            status: targetBuilderId ? 'completed' : 'pending',
        });

        const hasActive = nodes.some((n) => n.status === 'active');
        if (!hasActive) {
            const firstPending = nodes.findIndex((n) => n.status === 'pending');
            if (firstPending >= 0) {
                nodes[firstPending] = { ...nodes[firstPending], status: 'active' };
            }
        }

        return nodes;
    }, [isAssignMode, requiredAuthorityCount, authority1, authority2, authority3, targetBuilderId, userById]);

    const chainLabel = useMemo(() => {
        if (!workflowSteps.length) return 'No workflow steps configured.';
        return workflowSteps.map((n) => n.name).join(' -> ');
    }, [workflowSteps]);

    const strategyOptions = [
        { key: 'NORMAL', label: 'Normal', help: 'Directly route to the target Builder' },
        { key: 'LEVEL_1', label: 'Level 1', help: 'One authority approves, then Builder' },
        { key: 'LEVEL_2', label: 'Level 2', help: 'Two authorities approve, then Builder' },
        { key: 'LEVEL_3', label: 'Level 3', help: 'Three authorities approve, then Builder' },
    ];

    const authority2Candidates = useMemo(() => {
        if (!authority1) return authorities;
        return authorities.filter((u) => String(u.id) !== String(authority1));
    }, [authorities, authority1]);

    const authority3Candidates = useMemo(() => {
        return authorities.filter((u) => {
            const idS = String(u.id);
            return idS !== String(authority1) && idS !== String(authority2);
        });
    }, [authorities, authority1, authority2]);

    useEffect(() => {
        // Cleanup based on level/dedupe
        if (strategy !== 'LEVEL_3' && authority3) {
            setAuthority3('');
        }
        if (strategy !== 'LEVEL_2' && strategy !== 'LEVEL_3' && authority2) {
            setAuthority2('');
        }
        
        // Ensure values reset if their source candidates disappear
        if (authority2 && !authority2Candidates.some((u) => String(u.id) === String(authority2))) {
            setAuthority2('');
        }
        if (authority3 && !authority3Candidates.some((u) => String(u.id) === String(authority3))) {
            setAuthority3('');
        }
    }, [strategy, authority2, authority3, authority2Candidates, authority3Candidates]);

    function filterUsers(users, query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) => {
            const name = (u?.name || '').toLowerCase();
            const username = (u?.username || '').toLowerCase();
            return name.includes(q) || username.includes(q);
        });
    }

    function validate() {
        if (viewerReassignBlocked) {
            toastError('Viewer cannot change Builder after first assignment. Contact Admin.');
            return false;
        }

        if (!targetBuilderId) {
            toastError('Target Builder is required.');
            return false;
        }

        if (isAssignMode) {
            return true;
        }

        if (!isAdmin && form?.assignedBuilderId && Number(targetBuilderId) !== Number(form.assignedBuilderId)) {
            toastError('Only the assigned Builder can start this workflow.');
            return false;
        }

        if (requiredAuthorityCount >= 1 && !authority1) {
            toastError('Authority 1 is required for selected flow level.');
            return false;
        }
        if (requiredAuthorityCount >= 2 && !authority2) {
            toastError('Authority 2 is required for Level 2/3 flow.');
            return false;
        }
        if (requiredAuthorityCount >= 3 && !authority3) {
            toastError('Authority 3 is required for Level 3 flow.');
            return false;
        }
        if (selectedUserIds.size !== (intermediateIds.length + 1)) {
            toastError('Each selected user in the chain must be unique.');
            return false;
        }
        return true;
    }

    async function handleSubmit() {
        if (!validate() || !id) return;

        setSubmitting(true);
        try {
            if (isAssignMode) {
                await assignBuilder(id, Number(targetBuilderId));
                toastSuccess('Form handed over to Builder successfully.');
            } else {
                await initiateWorkflow(id, Number(targetBuilderId), intermediateIds);
                toastSuccess('Workflow initiated successfully.');
            }
            router.push('/forms/vault');
        } catch (err) {
            toastError(err.message || (isAssignMode ? 'Failed to assign builder.' : 'Failed to start workflow.'));
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <>
                <Navbar />
                <div className="loading-center" style={{ minHeight: '60vh' }}>
                    <span className="spinner" style={{ width: 36, height: 36 }} />
                </div>
            </>
        );
    }

    const RadioUserGroup = ({
        title,
        users,
        selectedId,
        setSelectedId,
        disabled = false,
        emptyText,
        searchValue,
        setSearchValue,
        searchPlaceholder,
        allowClear = false,
    }) => {
        const filteredUsers = filterUsers(users, searchValue);
        return (
            <div className="wf-group">
                <div className="wf-group-head">
                    <div className="wf-group-label">{title}</div>
                    {allowClear && selectedId && (
                        <button type="button" className="wf-clear-link" onClick={() => setSelectedId('')}>
                            Clear
                        </button>
                    )}
                </div>
                <div className="wf-search-wrap">
                    <input
                        type="text"
                        className="form-input wf-search-input"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        placeholder={searchPlaceholder || 'Search by name or username'}
                        disabled={disabled || !users.length}
                    />
                </div>
                {!users.length ? (
                    <div className="wf-empty-text">{emptyText || 'No users available.'}</div>
                ) : !filteredUsers.length ? (
                    <div className="wf-empty-text">No users match your search.</div>
                ) : (
                    <div className="wf-radio-grid">
                        {filteredUsers.map((u) => {
                            const optionValue = String(u.id);
                            const checked = selectedId === optionValue;
                            return (
                                <label
                                    key={u.id}
                                    className={`wf-radio-card${checked ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name={title}
                                        value={optionValue}
                                        checked={checked}
                                        onChange={(e) => setSelectedId(e.target.value)}
                                        disabled={disabled}
                                    />
                                    <span className="wf-radio-text">
                                        <strong>{u.name || u.username}</strong> ({u.username})
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <Head><title>Create Workflow — FormCraft</title></Head>
            <Navbar />
            <div className="container wf-setup-page">
                <WorkflowHeader
                    title="Workflow Process"
                    subtitle="Configure and preview a horizontal process before starting the workflow."
                />

                <div className="wf-setup-header">
                    <h1>{isAssignMode ? 'Assign to Builder' : 'Initiate Workflow'}</h1>
                    <p>
                        {form
                            ? `Form: ${form.name}`
                            : (isAssignMode
                                ? 'Select a Builder to hand over this form to.'
                                : 'Configure the approval levels for this assignment.')}
                    </p>
                </div>

                {!isAssignMode && !isAdmin && !form?.assignedBuilderId && (
                    <div className="card wf-notice-card">
                        <div className="wf-notice-text">
                            This form must be assigned to a Builder before workflow can start.
                        </div>
                    </div>
                )}

                {viewerReassignBlocked && (
                    <div className="card wf-notice-card">
                        <div className="wf-notice-text">
                            Builder already assigned to <strong>{form?.assignedBuilderUsername}</strong>. Viewer cannot change the assignment unless the form is <strong>REJECTED</strong>.
                        </div>
                    </div>
                )}

                <div className="card wf-setup-card">
                    {!isAssignMode && (
                        <div className="wf-group wf-mode-panel">
                            <div className="wf-group-label">Workflow Level</div>
                            <div className="wf-mode-toggle" role="tablist" aria-label="Workflow level toggle">
                                {strategyOptions.map((opt) => {
                                    const checked = strategy === opt.key;
                                    return (
                                        <button
                                            type="button"
                                            key={opt.key}
                                            className={`wf-mode-btn${checked ? ' active' : ''}`}
                                            onClick={() => setStrategy(opt.key)}
                                            role="tab"
                                            aria-selected={checked}
                                        >
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="wf-radio-help">
                                {strategyOptions.find((s) => s.key === strategy)?.help}
                            </div>
                        </div>
                    )}

                    {!isAssignMode && strategy === 'NORMAL' && (
                        <div className="wf-chain-text">No authority step required for Normal flow.</div>
                    )}

                    {!isAssignMode && strategy === 'LEVEL_1' && (
                        <RadioUserGroup
                            title="Authority 1 (Manager/Approver)"
                            users={authorities}
                            selectedId={authority1}
                            setSelectedId={setAuthority1}
                            searchValue={authority1Search}
                            setSearchValue={setAuthority1Search}
                            searchPlaceholder="Search authority"
                            allowClear
                            emptyText="No authority users available."
                        />
                    )}

                    {!isAssignMode && strategy === 'LEVEL_2' && (
                        <>
                            <RadioUserGroup
                                title="Authority 1 (Manager/Approver)"
                                users={authorities}
                                selectedId={authority1}
                                setSelectedId={setAuthority1}
                                searchValue={authority1Search}
                                setSearchValue={setAuthority1Search}
                                searchPlaceholder="Search authority 1"
                                allowClear
                                emptyText="No authority users available."
                            />

                            <RadioUserGroup
                                title="Authority 2 (Manager/Approver)"
                                users={authority2Candidates}
                                selectedId={authority2}
                                setSelectedId={setAuthority2}
                                searchValue={authority2Search}
                                setSearchValue={setAuthority2Search}
                                searchPlaceholder="Search authority 2"
                                allowClear
                                emptyText={authority1 ? 'No other authority available. Clear or change Authority 1.' : 'No authority users available.'}
                            />
                        </>
                    )}

                    {!isAssignMode && strategy === 'LEVEL_3' && (
                        <>
                            <RadioUserGroup
                                title="Authority 1 (Manager/Approver)"
                                users={authorities}
                                selectedId={authority1}
                                setSelectedId={setAuthority1}
                                searchValue={authority1Search}
                                setSearchValue={setAuthority1Search}
                                searchPlaceholder="Search authority 1"
                                allowClear
                                emptyText="No authority users available."
                            />

                            <RadioUserGroup
                                title="Authority 2 (Manager/Approver)"
                                users={authority2Candidates}
                                selectedId={authority2}
                                setSelectedId={setAuthority2}
                                searchValue={authority2Search}
                                setSearchValue={setAuthority2Search}
                                searchPlaceholder="Search authority 2"
                                allowClear
                                emptyText={authority1 ? 'No other authority available.' : 'No authority users available.'}
                            />

                            <RadioUserGroup
                                title="Authority 3 (Manager/Approver)"
                                users={authority3Candidates}
                                selectedId={authority3}
                                setSelectedId={setAuthority3}
                                searchValue={authority3Search}
                                setSearchValue={setAuthority3Search}
                                searchPlaceholder="Search authority 3"
                                allowClear
                                emptyText={(authority1 && authority2) ? 'No more authorities available.' : 'No authority users available.'}
                            />
                        </>
                    )}

                    <RadioUserGroup
                        title={isAssignMode ? 'Assign Builder' : 'Target Builder'}
                        users={builders}
                        selectedId={targetBuilderId}
                        setSelectedId={setTargetBuilderId}
                        searchValue={builderSearch}
                        setSearchValue={setBuilderSearch}
                        searchPlaceholder="Search builder"
                        disabled={viewerReassignBlocked || (!isAdmin && !isAssignMode && !!form?.assignedBuilderId)}
                        emptyText="No Builder users available."
                    />

                    {!isAssignMode && form?.assignedBuilderUsername && (
                        <div className="wf-assigned-pill">
                            Assigned Builder: <strong>{form.assignedBuilderUsername}</strong>
                        </div>
                    )}

                    <div className="wf-action-row">
                        <button type="button" className="btn btn-secondary" onClick={() => router.push('/dashboard')}>
                            Cancel
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || viewerReassignBlocked}>
                            {submitting ? (isAssignMode ? 'Processing...' : 'Starting...') : (isAssignMode ? 'Hand over to Builder' : 'Start Workflow')}
                        </button>
                    </div>
                </div>

                <div className="card wf-visual-card">
                    <div className="wf-group-label">Workflow Visualization</div>
                    <div className="wf-visual-subtext">Live chain preview based on your current selections.</div>

                    <WorkflowDiagram steps={workflowSteps} />

                    <div className="wf-chain-text">{chainLabel}</div>
                </div>
            </div>
        </>
    );
}



