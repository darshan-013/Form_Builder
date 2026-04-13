import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Platform', href: '#overview' },
  { label: 'Login', href: '/login' },
  { label: 'Sign up', href: '/register' },
];

export default function Footer() {
  const { theme } = useTheme();

  return (
    <footer style={{
      background: 'var(--bg-base)',
      borderTop: '1px solid var(--border)',
      padding: '48px 24px',
    }}>
      <div style={{
        maxWidth: '1200px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '20px',
      }}>
        {/* Brand */}
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '18px',
          letterSpacing: '-0.03em', color: 'var(--text-primary)',
          textDecoration: 'none',
        }}>
          <Zap size={18} style={{ color: 'var(--accent)' }} />
          FormCraft
        </Link>

        {/* Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '26px', flexWrap: 'wrap' }}>
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontSize: '13.5px', fontWeight: 500,
                color: 'var(--text-muted)',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Copyright */}
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} FormCraft
        </p>
      </div>
    </footer>
  );
}
