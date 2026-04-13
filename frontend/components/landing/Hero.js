import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import FloatingUI from './FloatingUI';
import Magnetic from './Magnetic';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: d },
  }),
};

export default function Hero() {
  const { theme } = useTheme();

  return (
    <section
      className="landing-grid-lines"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '128px 24px 110px',
        textAlign: 'center',
        background: 'var(--bg-base)',
        /* Colorful blueprint grid lines */
        '--pattern-color': theme === 'dark' ? 'rgba(139, 92, 246, 0.05)' : 'rgba(124, 58, 237, 0.08)',
        '--pattern-size': '44px',
      }}
    >
      {/* ── Application UI Elements (Floating) ── */}
      <FloatingUI />
      {/* ── Colorful Top Strip ── */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
        background: 'var(--accent-grad)',
        opacity: theme === 'dark' ? 0.6 : 1,
      }} />

      {/* ── Branded Framing Lines ── */}
      <div aria-hidden style={{
        position: 'absolute', left: '10%', top: 0, bottom: 0, width: '1px',
        background: 'linear-gradient(to bottom, var(--accent), var(--accent-2), transparent)',
        opacity: theme === 'dark' ? 0.15 : 0.25,
      }} />
      <div aria-hidden style={{
        position: 'absolute', right: '10%', top: 0, bottom: 0, width: '1px',
        background: 'linear-gradient(to bottom, var(--accent-3), var(--accent-2), transparent)',
        opacity: theme === 'dark' ? 0.15 : 0.25,
      }} />

      {/* Large radial glow BEHIND headline — infused with colors */}
      <div
        aria-hidden
        className="landing-float-slow"
        style={{
          position: 'absolute',
          left: '50%', top: '20%',
          transform: 'translateX(-50%)',
          width: '800px', height: '500px',
          borderRadius: '50%',
          background: theme === 'dark'
            ? 'radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, rgba(236,72,153,0.08) 40%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(139,92,246,0.1) 0%, rgba(236,72,153,0.05) 45%, transparent 75%)',
          filter: 'blur(64px)',
          pointerEvents: 'none',
        }}
      />

      {/* Colorful side glows */}
      <div
        aria-hidden
        className="landing-float"
        style={{
          position: 'absolute',
          left: '-160px', top: '10%',
          width: '480px', height: '480px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 65%)',
          filter: 'blur(64px)',
          pointerEvents: 'none',
          opacity: 1,
        }}
      />
      <div
        aria-hidden
        className="landing-float-slow"
        style={{
          position: 'absolute',
          right: '-140px', bottom: '10%',
          width: '420px', height: '420px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 65%)',
          filter: 'blur(64px)',
          pointerEvents: 'none',
          opacity: 1,
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', maxWidth: '860px', margin: '0 auto', zIndex: 10 }}>

        {/* Badge */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="show" custom={0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '6px 14px', marginBottom: '32px',
            borderRadius: '999px',
            border: '1px solid var(--accent)',
            background: 'var(--bg-card)',
            backdropFilter: 'blur(8px)',
            fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.09em',
            textTransform: 'uppercase', color: 'var(--accent)',
            boxShadow: theme === 'light' ? '0 2px 10px rgba(124, 58, 237, 0.1)' : 'none',
          }}
        >
          <Sparkles size={11} />
          FormCraft v2 — Now live
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp} initial="hidden" animate="show" custom={0.1}
          style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 'clamp(52px, 8.5vw, 88px)',
            lineHeight: 1.02, letterSpacing: '-0.045em',
            margin: '0 0 22px', color: 'var(--text-primary)',
          }}
        >
          Build elegant forms.
          <br />
          <span
            className="landing-shimmer"
            style={{
              backgroundImage: theme === 'dark'
                ? 'linear-gradient(90deg, #c4b5fd 0%, #818cf8 30%, #8b5cf6 50%, #818cf8 70%, #c4b5fd 100%)'
                : 'linear-gradient(90deg, #7C3AED 0%, #6366F1 30%, #EC4899 50%, #6366F1 70%, #7C3AED 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            At lightning speed.
          </span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          variants={fadeUp} initial="hidden" animate="show" custom={0.2}
          style={{
            color: 'var(--text-secondary)',
            fontSize: 'clamp(16px, 2vw, 18.5px)',
            lineHeight: 1.72, maxWidth: '520px', margin: '0 auto 44px',
          }}
        >
          A premium form operations platform designed for scale. Build dynamic
          workflows, enforce strict validation, and collect beautiful data —
          without writing backend logic.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="show" custom={0.3}
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '14px', flexWrap: 'wrap',
          }}
        >
          <Magnetic strength={0.12}>
            <Link href="/register">
              <motion.span
                className="landing-pulse-glow"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '14px 28px', fontSize: '15px', fontWeight: 600,
                  borderRadius: '12px', cursor: 'pointer',
                  color: '#fff',
                  background: 'var(--accent-grad)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  textDecoration: 'none',
                }}
                whileHover={{
                  scale: 1.03, y: -1,
                  boxShadow: theme === 'dark' ? '0 20px 60px rgba(99,102,241,0.5)' : '0 10px 30px rgba(124, 58, 237, 0.3)',
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                Start building free
                <ArrowRight size={16} />
              </motion.span>
            </Link>
          </Magnetic>

          <Magnetic strength={0.15}>
            <a href="#features">
              <motion.span
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '14px 28px', fontSize: '15px', fontWeight: 600,
                  borderRadius: '12px', cursor: 'pointer',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  backdropFilter: 'blur(8px)',
                  textDecoration: 'none',
                }}
                whileHover={{
                  scale: 1.03, y: -1,
                  background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(124, 58, 237, 0.05)',
                  borderColor: 'var(--accent)',
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                Explore platform
              </motion.span>
            </a>
          </Magnetic>
        </motion.div>
      </div>
    </section>
  );
}
