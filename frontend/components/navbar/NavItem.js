import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function NavItem({ href, children, icon }) {
  const router = useRouter();
  const isActive = router.pathname === href;

  return (
    <Link 
      href={href}
      className={`
        px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg flex items-center gap-2
        ${isActive 
          ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' 
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/5'
        }
      `}
    >
      {icon && <span className="text-lg opacity-70">{icon}</span>}
      {children}
    </Link>
  );
}
