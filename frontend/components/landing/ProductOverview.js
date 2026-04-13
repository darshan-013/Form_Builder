import { motion } from 'framer-motion';
import { FileCode2, Users, SlidersHorizontal } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import SpotlightCard from './SpotlightCard';

const ITEMS = [
  {
    icon: FileCode2,
    heading: 'Form Lifecycle Control',
    text: 'Manage draft, publish, update, soft-delete, and restore flows without losing traceability. Full version history built in.',
    accent: '#8b5cf6',
    accentRgb: '139,92,246',
  },
  {
    icon: Users,
    heading: 'Role-Centric Administration',
    text: 'Empower Admin and Role Administrator workflows with clean, dedicated management surfaces that scale with your team.',
    accent: '#6366f1',
    accentRgb: '99,102,241',
  },
  {
    icon: SlidersHorizontal,
    heading: 'Granular Access Control',
    text: 'Configure role-based form access with explicit user permissions while preserving privileged oversight at every level.',
    accent: '#ec4899',
    accentRgb: '236,72,153',
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const itemMotion = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
};

export default function ProductOverview() {
  const { theme } = useTheme();

  return (
    <section
      id="overview"
      className="landing-grid-lines"
      style={{
        padding: '96px 24px',
        background: theme === 'dark' ? 'var(--bg-surface)' : 'rgba(245, 243, 255, 0.5)', /* Soft violet surface tint for depth */
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
        '--pattern-color': theme === 'dark' ? 'rgba(139, 92, 246, 0.03)' : 'rgba(124, 58, 237, 0.06)',
        '--pattern-size': '80px',
      }}
    >
      {/* Vertical branded structural line */}
      <div aria-hidden style={{ 
        position: 'absolute', left: '15%', top: 0, bottom: 0, width: '2px', 
        background: 'linear-gradient(to bottom, var(--accent), var(--accent-3), transparent)', 
        opacity: 0.25 
      }} />

      {/* Branded radial glows */}
      <div aria-hidden style={{
        position: 'absolute', right: '-150px', top: '10%',
        width: '500px', height: '500px', borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)',
        filter: 'blur(40px)',
        opacity: 1,
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: '-100px', bottom: '10%',
        width: '400px', height: '400px', borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(236,72,153,0.06) 0%, transparent 65%)',
        filter: 'blur(40px)',
        opacity: 1,
      }} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        <motion.div
          style={{ textAlign: 'center', marginBottom: '64px', maxWidth: '560px', margin: '0 auto 64px' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <p style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '14px',
          }}>
            Platform overview
          </p>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 'clamp(30px, 4.5vw, 44px)',
            letterSpacing: '-0.035em', lineHeight: 1.08,
            color: 'var(--text-primary)', marginBottom: '16px',
          }}>
            Built for real<br />internal processes
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.68 }}>
            FormCraft combines builder flexibility with governance controls so
            teams can move faster without losing control.
          </p>
        </motion.div>

        <motion.div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
        >
          {ITEMS.map((i) => {
            const Icon = i.icon;
            return (
              <motion.div key={i.heading} variants={itemMotion}>
                <SpotlightCard
                  tiltStrength={2}
                  spotlightColor={`rgba(${i.accentRgb}, 0.1)`}
                  style={{ height: '100%', borderRadius: '24px' }}
                >
                  <article
                    style={{
                      height: '100%',
                      display: 'flex', flexDirection: 'column', gap: '20px',
                      padding: '32px', borderRadius: '24px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                      boxShadow: theme === 'dark' ? 'var(--shadow)' : '0 12px 30px -8px rgba(124, 58, 237, 0.1)',
                      transition: 'border-color 0.25s, box-shadow 0.25s',
                    }}
                  >
                    <div style={{
                      width: '48px', height: '48px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '14px',
                      background: `rgba(${i.accentRgb}, 0.12)`,
                      color: i.accent,
                      border: `1px solid rgba(${i.accentRgb}, 0.2)`,
                      boxShadow: `0 4px 12px rgba(${i.accentRgb}, 0.15)`,
                      transition: 'background 0.25s, color 0.25s, box-shadow 0.25s',
                    }}>
                      <Icon size={22} strokeWidth={2} />
                    </div>
                    <div>
                      <h3 style={{
                        fontSize: '15.5px', fontWeight: 700,
                        color: 'var(--text-primary)', marginBottom: '9px', letterSpacing: '-0.01em',
                      }}>
                        {i.heading}
                      </h3>
                      <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.67 }}>
                        {i.text}
                      </p>
                    </div>
                  </article>
                </SpotlightCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
