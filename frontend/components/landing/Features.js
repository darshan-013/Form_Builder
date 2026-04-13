import { motion } from 'framer-motion';
import { Layers, ShieldCheck, Route, Fingerprint, GripVertical, Settings2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import SpotlightCard from './SpotlightCard';

const FEATURES = [
  {
    icon: Layers,
    title: 'Visual Form Builder',
    desc: 'Construct powerful multi-page forms with real-time previews. Drag, drop, and configure without writing code.',
    accent: '#a78bfa',
    accentRgb: '167,139,250',
    iconBg: 'rgba(139,92,246,0.1)',
    grad: 'linear-gradient(to right, #8b5cf6, #6366f1)',
  },
  {
    icon: ShieldCheck,
    title: 'Role-First Access',
    desc: 'Zero-trust architecture. Define strict access boundaries and assign viewing or editing rights surgically.',
    accent: '#818cf8',
    accentRgb: '99,102,241',
    iconBg: 'rgba(99,102,241,0.1)',
    grad: 'linear-gradient(to right, #6366f1, #38bdf8)',
  },
  {
    icon: Route,
    title: 'Dynamic Routing',
    desc: 'Advanced logic. Design multi-step workflows with conditional routing based on real form responses.',
    accent: '#38bdf8',
    accentRgb: '56,189,248',
    iconBg: 'rgba(14,165,233,0.1)',
    grad: 'linear-gradient(to right, #0ea5e9, #10b981)',
  },
  {
    icon: Fingerprint,
    title: 'Compliance & Audit',
    desc: 'Enterprise-grade visibility. Every change and submission is immutably logged for complete audit trails.',
    accent: '#34d399',
    accentRgb: '52,211,153',
    iconBg: 'rgba(16,185,129,0.1)',
    grad: 'linear-gradient(to right, #10b981, #8b5cf6)',
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const cardMotion = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
};

export default function Features() {
  const { theme } = useTheme();

  return (
    <section
      id="features"
      className="landing-grid-lines"
      style={{
        padding: '96px 24px',
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border)',
        '--pattern-color': theme === 'dark' ? 'rgba(139, 92, 246, 0.04)' : 'rgba(124, 58, 237, 0.07)',
        '--pattern-size': '64px',
        position: 'relative', overflow: 'hidden'
      }}
    >
      {/* ── Branded UI Sparks (Background) ── */}
      <motion.div aria-hidden style={{ position: 'absolute', right: '5%', top: '15%', color: 'var(--accent)', opacity: 0.15 }} animate={{ y: [0, -20, 0] }} transition={{ duration: 5, repeat: Infinity }}>
        <GripVertical size={44} />
      </motion.div>
      <motion.div aria-hidden style={{ position: 'absolute', left: '3%', bottom: '20%', color: 'var(--accent-2)', opacity: 0.1 }} animate={{ rotate: [0, 10, 0] }} transition={{ duration: 8, repeat: Infinity }}>
        <Settings2 size={60} />
      </motion.div>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>

        {/* Branded decorative elements */}
        <div aria-hidden style={{ position: 'absolute', left: '-20px', top: '-10px', color: 'var(--accent)', fontSize: '20px', fontWeight: 300 }}>+</div>
        <div aria-hidden style={{ 
          position: 'absolute', right: '-120px', top: '10%', width: '2px', bottom: '0', 
          background: 'var(--accent-grad)', opacity: 0.2 
        }} />

        {/* Section header */}
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
            Platform capabilities
          </p>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 'clamp(30px, 4.5vw, 44px)',
            letterSpacing: '-0.035em', lineHeight: 1.08,
            color: 'var(--text-primary)', marginBottom: '16px',
          }}>
            Engineered for scale<br />and security
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.68 }}>
            Stop writing boilerplate. FormCraft gives you everything you need to
            build, validate, and process complex operational data.
          </p>
        </motion.div>

        {/* Card grid */}
        <motion.div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '24px',
          }}
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
        >
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <motion.div key={f.title} variants={cardMotion}>
                <SpotlightCard
                  tiltStrength={2}
                  spotlightColor={`rgba(${f.accentRgb}, 0.1)`}
                  style={{ height: '100%', borderRadius: '24px' }}
                >
                  <article
                    style={{
                      height: '100%',
                      display: 'flex', flexDirection: 'column', gap: '18px',
                      padding: '32px',
                      borderRadius: '20px',
                      border: '1px solid var(--border)',
                      background: theme === 'dark' 
                        ? 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                        : 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(12px)',
                      boxShadow: theme === 'dark' ? 'none' : '0 10px 40px -10px rgba(124, 58, 237, 0.08)',
                      transition: 'border-color 0.25s, box-shadow 0.25s, background 0.25s',
                      cursor: 'default',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Colorful Top Accent Strip */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                      background: f.grad,
                      opacity: 0.8,
                    }} />

                    {/* Icon with colored container */}
                    <div style={{
                      width: '44px', height: '44px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '12px',
                      background: f.iconBg,
                      color: f.accent,
                      border: `1px solid rgba(${f.accentRgb}, 0.15)`,
                      boxShadow: `0 4px 12px rgba(${f.accentRgb}, 0.15)`,
                    }}>
                      <Icon size={20} strokeWidth={2} />
                    </div>

                    <div>
                      <h3 style={{
                        fontSize: '15px', fontWeight: 600,
                        color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.01em',
                      }}>
                        {f.title}
                      </h3>
                      <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.67 }}>
                        {f.desc}
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
