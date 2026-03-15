import React from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import Dropdown from '../ui/Dropdown';
import Button from '../ui/Button';

export default function UserMenu() {
  const router = useRouter();
  const { user, roles, clearAuth } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      clearAuth();
      toastSuccess('You have been logged out.');
      router.push('/login');
    } catch {
      toastError('Logout failed. Please try again.');
    }
  };

  const roleDisplay = roles && roles.length > 0
    ? roles.map(r => r.roleName).join(', ')
    : 'Viewer';

  if (!user) return null;

  return (
    <Dropdown
      trigger={
        <Button variant="secondary" size="sm" className="!rounded-full gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-500">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <span className="hidden sm:inline text-xs font-semibold">{user.username}</span>
          <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      }
    >
      <div className="p-3 border-b border-gray-100 dark:border-white/5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Signed in as</p>
        <p className="text-sm font-semibold truncate">{user.username}</p>
        <p className="text-[11px] text-gray-500 truncate">{roleDisplay}</p>
      </div>
      <div className="p-1 text-sm">
        <button className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          Profile Settings
        </button>
        <button className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          Security
        </button>
        <div className="h-[1px] bg-gray-100 dark:bg-white/5 my-1" />
        <button 
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          Logout
        </button>
      </div>
    </Dropdown>
  );
}
