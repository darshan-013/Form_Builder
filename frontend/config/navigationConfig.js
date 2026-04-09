/**
 * Navigation configuration for the application.
 * Defines sections and items with their respective routes, icons, and visibility rules (roles/permissions).
 */
export const navigationLinks = [
    {
        section: 'General',
        items: [
            { label: 'Dashboard', href: '/dashboard', icon: '⌂' },
            { label: 'Form Vault', href: '/forms/vault', icon: '🗄' },
        ]
    },
    {
        section: 'Management',
        items: [
            { label: 'Users', href: '/users', icon: '👤', permission: 'MANAGE' },
            { label: 'Roles', href: '/roles', icon: '🛡️', permission: 'MANAGE' },
            { label: 'Audit Logs', href: '/logs/admin', icon: '🧾', roles: ['Role Administrator'] },
            { label: 'Role Logs', href: '/logs/role-assignments', icon: '🗂', roles: ['Role Administrator'] },
        ]
    },
    {
        section: 'Workflows',
        items: [
            { label: 'Approval Inbox', href: '/admin/approvals', icon: '✓', roles: ['Builder', 'Approver', 'Manager'] },
            { label: 'Workflow Status', href: '/workflows/status', icon: '📈', roles: ['Viewer', 'Creator'] },
            { label: 'Workflow Review', href: '/workflows/review', icon: '◇', roles: ['Builder'] },
            { label: 'Workflow Monitor', href: '/admin/workflows/status', icon: '◉', roles: ['Admin'] },
        ]
    },
    {
        section: 'Creation',
        items: [
            { label: 'New Form', href: '/builder/new', icon: '➕', permission: 'WRITE', fallbackRoles: ['Viewer'] },
        ]
    }
];
