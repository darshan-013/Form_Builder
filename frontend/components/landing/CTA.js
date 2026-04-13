import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import Magnetic from './Magnetic';

export default function CTA() {
  const { theme } = useTheme();

  return (
    <section 
      className="landing-grid-lines"
      style={{ 
        padding: '96px 24px 112px', 
        background: 'var(--bg-base)',
        '--pattern-color': theme === 'dark' ? 'rgba(139, 92, 246, 0.05)' : 'rgba(124, 58, 237, 0.08)',
        '--pattern-size': '120px',
      }}
    >
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'relative', overflow: 'hidden',
            padding: '72px 48px', borderRadius: '32px', textAlign: 'center',
            border: '1px solid var(--border)',
            background: theme === 'dark'
              ? 'linear-gradient(145deg, rgba(139,92,246,0.1) 0%, rgba(6,6,18,0.95) 45%, rgba(236,72,153,0.08) 100%)'
              : 'linear-gradient(135deg, rgba(245, 243, 255, 0.8) 0%, #fff 45%, rgba(253, 242, 248, 0.8) 100%)',
            boxShadow: theme === 'dark' ? 'var(--shadow-lg)' : '0 32px 64px -16px rgba(124, 58, 237, 0.15)',
          }}
        >
          {/* Branded decorative structural strips */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--accent-grad)', opacity: theme === 'dark' ? 0.3 : 0.8 }} />

          {/* Large multi-color corner blobs — inside card */}
          <div aria-hidden style={{
            position: 'absolute', top: '-60px', right: '-60px',
            width: '320px', height: '320px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 65%)',
            filter: 'blur(40px)', pointerEvents: 'none',
          }} />
          <div aria-hidden style={{
            position: 'absolute', bottom: '-40px', left: '-40px',
            width: '280px', height: '280px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 65%)',
            filter: 'blur(40px)', pointerEvents: 'none',
          }} />

          {/* Decorative architectural markers */}
          <div style={{ position: 'absolute', top: 20, left: 20, width: '40px', height: '1px', background: 'var(--accent)', opacity: 0.3 }} />
          <div style={{ position: 'absolute', top: 20, left: 20, width: '1px', height: '40px', background: 'var(--accent)', opacity: 0.3 }} />

          <div style={{ position: 'relative', zIndex: 10 }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif', fontWeight: 800,
              fontSize: 'clamp(32px, 4.5vw, 52px)',
              letterSpacing: '-0.04em', lineHeight: 1.06,
              color: 'var(--text-primary)', marginBottom: '16px',
            }}>
              Start with confidence
            </h2>
            <p style={{
              fontSize: '16px', color: 'var(--text-secondary)',
              lineHeight: 1.7, maxWidth: '460px', margin: '0 auto 40px',
            }}>
              Launch your workspace, assign access clearly, and keep every
              critical action traceable from day one.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <Magnetic strength={0.12}>
                <Link href="/register">
                  <motion.span
                    className="landing-pulse-glow"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '14px 34px', fontSize: '15px', fontWeight: 600,
                      borderRadius: '14px', cursor: 'pointer',
                      color: '#fff',
                      background: 'var(--accent-grad)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      textDecoration: 'none',
                    }}
                    whileHover={{
                      scale: 1.03, y: -1,
                      boxShadow: theme === 'dark' ? '0 20px 60px rgba(99,102,241,0.55)' : '0 15px 40px rgba(124, 58, 237, 0.35)',
                    }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                  >
                    Create free account
                    <ArrowRight size={16} />
                  </motion.span>
                </Link>
              </Magnetic>

              <Magnetic strength={0.15}>
                <Link href="/login">
                  <motion.span
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '14px 34px', fontSize: '15px', fontWeight: 600,
                      borderRadius: '14px', cursor: 'pointer',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card)',
                      backdropFilter: 'blur(8px)',
                      textDecoration: 'none',
                    }}
                    whileHover={{
                      scale: 1.03, y: -1,
                      background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#fff',
                      borderColor: 'var(--accent)',
                      boxShadow: theme === 'light' ? '0 10px 20px rgba(124, 58, 237, 0.08)' : 'none',
                    }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                  >
                    Sign in
                  </motion.span>
                </Link>
              </Magnetic>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
