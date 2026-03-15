import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import NavItem from './navbar/NavItem';
import ThemeToggle from './navbar/ThemeToggle';
import UserMenu from './navbar/UserMenu';
import NotificationBell from './navbar/NotificationBell';
import Container from './ui/Container';

export default function Navbar() {
  const { user, can, hasRole } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`
      sticky top-0 z-[100] w-full transition-all duration-300
      ${isScrolled 
        ? 'bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 shadow-sm' 
        : 'bg-transparent'
      }
    `}>
      <Container size="7xl">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
              F
            </div>
            <span className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white hidden sm:block">
              Form<span className="text-indigo-600">Craft</span>
            </span>
          </Link>

          {/* Center Links (Primary) */}
          <div className="hidden lg:flex items-center gap-1">
            <NavItem href="/dashboard">Dashboard</NavItem>
            {can('MANAGE') && <NavItem href="/users">Users</NavItem>}
            {can('MANAGE') && <NavItem href="/roles">Roles</NavItem>}
            
            {/* Contextual links based on roles */}
            {(hasRole('Manager') || hasRole('Approver') || hasRole('Builder')) && (
              <NavItem href="/admin/approvals">Approvals</NavItem>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-4 border-r border-gray-100 dark:border-white/5">
              <ThemeToggle />
              <NotificationBell />
            </div>
            <UserMenu />
          </div>
        </div>
      </Container>
    </nav>
  );
}
