'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { Zap, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'sticky', top: 0, zIndex: 100,
        transition: 'background 0.35s ease, box-shadow 0.35s ease',
        background: scrolled
          ? theme === 'dark' ? 'rgba(6, 6, 18, 0.82)' : 'rgba(255, 255, 255, 0.92)'
          : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(1.4)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(1.4)' : 'none',
        boxShadow: scrolled
          ? theme === 'dark' 
            ? '0 1px 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(139,92,246,0.15)'
            : '0 1px 0 0 rgba(15, 23, 42, 0.05), inset 0 -1px 0 0 rgba(124, 58, 237, 0.1)'
          : 'none',
      }}
    >
      <div
        style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 24px',
          height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        {/* Brand */}
        <Link
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: '20px', letterSpacing: '-0.03em',
            color: 'var(--text-primary)', textDecoration: 'none',
          }}
        >
          <Zap size={22} style={{ color: 'var(--accent)' }} />
          FormCraft
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[['Features', '#features'], ['Platform', '#overview']].map(([label, href]) => (
            <NavLink key={label} label={label} href={href} />
          ))}

          <div style={{
            width: '1px', height: '18px',
            background: 'var(--border)', margin: '0 10px',
          }} />

          {/* Theme toggle */}
          <button
            onClick={(e) => toggleTheme(e)}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            style={{
              width: '34px', height: '34px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px', border: '1px solid var(--border)',
              cursor: 'pointer', background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              transition: 'background 0.2s, color 0.2s, border-color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'none';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Sign in */}
          <Link
            href="/login"
            style={{
              padding: '8px 14px', fontSize: '14px', fontWeight: 500,
              color: 'var(--text-secondary)', textDecoration: 'none',
              borderRadius: '8px', transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Sign in
          </Link>

          {/* Get started CTA */}
          <Link href="/register">
            <motion.span
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '8px 18px', fontSize: '14px', fontWeight: 600,
                color: '#fff', borderRadius: '9px', cursor: 'pointer',
                background: 'var(--accent-grad)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: theme === 'dark' 
                  ? '0 4px 18px rgba(139, 92, 246, 0.3)' 
                  : '0 4px 18px rgba(124, 58, 237, 0.2)',
                textDecoration: 'none',
              }}
              whileHover={{ scale: 1.03, boxShadow: '0 6px 28px rgba(139, 92, 246, 0.4)' }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              Get started
            </motion.span>
          </Link>
        </nav>
      </div>
    </motion.header>
  );
}

/* Animated underline nav link */
function NavLink({ label, href }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      style={{
        position: 'relative',
        padding: '8px 14px', fontSize: '14px', fontWeight: 500,
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        textDecoration: 'none', borderRadius: '8px',
        transition: 'color 0.2s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
      {/* Underline */}
      <motion.span
        animate={{ scaleX: hovered ? 1 : 0, opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          position: 'absolute', bottom: 4, left: 14, right: 14,
          height: '1px',
          background: 'var(--accent)',
          transformOrigin: 'left',
        }}
      />
    </a>
  );
}
