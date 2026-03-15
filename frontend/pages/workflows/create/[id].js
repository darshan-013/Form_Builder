import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import WorkflowHeader from '../../../components/workflows/WorkflowHeader';
import WorkflowDiagram from '../../../components/workflows/WorkflowDiagram';
import { assignBuilder, getForm, getWorkflowCandidates, initiateWorkflow } from '../../../services/api';
import { toastError, toastSuccess } from '../../../services/toast';
import { useAuth } from '../../../context/AuthContext';
import PageContainer from '../../../components/layout/PageContainer';
import SectionHeader from '../../../components/layout/SectionHeader';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Spinner from '../../../components/ui/Spinner';

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
    const [authority1Search, setAuthority1Search] = useState('');
    const [authority2Search, setAuthority2Search] = useState('');
    const [builderSearch, setBuilderSearch] = useState('');

    const isAdmin = hasRole('Admin');
    const isViewer = hasRole('Viewer');
    const isBuilder = hasRole('Builder');
    const isAssignMode = isViewer || (!isBuilder && isAdmin);
    const viewerReassignBlocked = isViewer && !!form?.assignedBuilderId;

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

    const requiredAuthorityCount = strategy === 'LEVEL_2' ? 2 : strategy === 'LEVEL_1' ? 1 : 0;

    const intermediateIds = useMemo(() => {
        const out = [];
        if (requiredAuthorityCount >= 1 && authority1) out.push(Number(authority1));
        if (requiredAuthorityCount >= 2 && authority2) out.push(Number(authority2));
        return out;
    }, [authority1, authority2, requiredAuthorityCount]);

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
    }, [isAssignMode, requiredAuthorityCount, authority1, authority2, targetBuilderId, userById]);

    const chainLabel = useMemo(() => {
        if (!workflowSteps.length) return 'No workflow steps configured.';
        return workflowSteps.map((n) => n.name).join(' -> ');
    }, [workflowSteps]);

    const strategyOptions = [
        { key: 'NORMAL', label: 'Normal', help: 'Directly route to the target Builder' },
        { key: 'LEVEL_1', label: 'Level 1', help: 'One authority approves, then Builder' },
        { key: 'LEVEL_2', label: 'Level 2', help: 'Two authorities approve, then Builder' },
    ];

    const authority2Candidates = useMemo(() => {
        if (!authority1) return authorities;
        return authorities.filter((u) => String(u.id) !== String(authority1));
    }, [authorities, authority1]);

    useEffect(() => {
        // When not on level 2, second authority is irrelevant.
        if (strategy !== 'LEVEL_2' && authority2) {
            setAuthority2('');
            return;
        }
        // If authority1 changed, ensure authority2 remains valid and distinct.
        if (authority2 && !authority2Candidates.some((u) => String(u.id) === String(authority2))) {
            setAuthority2('');
        }
    }, [strategy, authority2, authority2Candidates]);

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
            toastError('Authority 2 is required for Level 2 flow.');
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
                toastSuccess('Builder assigned successfully.');
            } else {
                await initiateWorkflow(id, Number(targetBuilderId), intermediateIds);
                toastSuccess('Workflow started successfully.');
            }
            router.push('/workflows/status');
        } catch (err) {
            toastError(err.message || (isAssignMode ? 'Failed to assign builder.' : 'Failed to start workflow.'));
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <PageContainer>
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Spinner size="lg" />
                    <p className="text-gray-500 animate-pulse">Initializing workflow setup...</p>
                </div>
            </PageContainer>
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
        <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</label>
                {allowClear && selectedId && (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedId('')}>
                        Clear selection
                    </button>
                )}
            </div>
            <div className="relative">
                <input
                    type="text"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder={searchPlaceholder || 'Search by name or username'}
                    disabled={disabled || !users.length}
                />
            </div>
            {!users.length ? (
                <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
                    {emptyText || 'No users available.'}
                </div>
            ) : !filteredUsers.length ? (
                <div className="p-4 text-center text-sm text-gray-500">No users match your search.</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {filteredUsers.map((u) => {
                        const optionValue = String(u.id);
                        const checked = selectedId === optionValue;
                        return (
                            <label
                                key={u.id}
                                className={`relative flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                    checked 
                                        ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' 
                                        : 'border-white/5 bg-white/5 hover:border-white/20'
                                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name={title}
                                    value={optionValue}
                                    checked={checked}
                                    onChange={(e) => setSelectedId(e.target.value)}
                                    disabled={disabled}
                                    className="sr-only"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold truncate ${checked ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>
                                        {u.name || u.username}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">@{u.username}</p>
                                </div>
                                {checked && (
                                    <div className="ml-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white scale-110">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                )}
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
            
            <PageContainer>
                <SectionHeader 
                    title={isAssignMode ? '👤 Assign Builder' : '🧭 Workflow Setup'}
                    subtitle={form ? `Form: ${form.name}` : 'Configure the approval chain and assign responsibilities'}
                    actions={
                        <div className="flex gap-2">
                             <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard')}>
                                Cancel
                            </Button>
                            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting || viewerReassignBlocked}>
                                {submitting ? <Spinner size="sm" /> : (isAssignMode ? 'Assign Builder' : 'Start Workflow')}
                            </Button>
                        </div>
                    }
                />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
                    <div className="lg:col-span-8 space-y-6">
                        {viewerReassignBlocked && (
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex gap-3 text-amber-700 dark:text-amber-300 text-sm">
                                <span>⚠️</span>
                                <p>Builder already assigned to <strong>{form?.assignedBuilderUsername}</strong>. Viewer cannot change it. Contact Admin for reassignment.</p>
                            </div>
                        )}

                        {!isAssignMode && !isAdmin && !form?.assignedBuilderId && (
                            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex gap-3 text-indigo-700 dark:text-indigo-300 text-sm">
                                <span>ℹ️</span>
                                <p>This form must be assigned to a Builder before workflow can start.</p>
                            </div>
                        )}

                        <Card>
                            <div className="p-6">
                                {!isAssignMode && (
                                    <div className="mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 block">Workflow Complexity</label>
                                        <div className="flex gap-2 p-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                                            {strategyOptions.map((opt) => {
                                                const checked = strategy === opt.key;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={opt.key}
                                                        className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
                                                            checked 
                                                                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                                        }`}
                                                        onClick={() => setStrategy(opt.key)}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="mt-3 text-xs text-gray-400 italic">
                                            {strategyOptions.find((s) => s.key === strategy)?.help}
                                        </p>
                                    </div>
                                )}

                                {!isAssignMode && strategy === 'NORMAL' && (
                                    <div className="py-10 text-center opacity-40">
                                        <p className="text-sm">No authority step required for Normal flow.</p>
                                    </div>
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
                                    <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary text-center">
                                        Form is currently assigned to <strong>@{form.assignedBuilderUsername}</strong>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>

                    <div className="lg:col-span-4 gap-6">
                         <div className="sticky top-24 space-y-6">
                            <Card className="overflow-hidden">
                                <div className="p-5">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Live Preview</h4>
                                    <WorkflowDiagram steps={workflowSteps} />
                                    
                                    <div className="mt-6 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                                        <p className="text-xs font-bold text-gray-400 mb-2">Chain Logic</p>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-mono">
                                            {chainLabel}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                            
                            <div className="p-6 bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 rounded-3xl">
                                <h4 className="text-sm font-bold mb-2">Next Steps</h4>
                                <ul className="text-xs text-gray-500 space-y-2 list-disc list-inside">
                                    <li>Builder will receive a notification</li>
                                    <li>Form will move to "Assigned" or "Pending" status</li>
                                    <li>Approvers will be able to review the form structure</li>
                                </ul>
                            </div>
                         </div>
                    </div>
                </div>
            </PageContainer>
        </>
    );
}
