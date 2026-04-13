'use client';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Type, CheckSquare, List, GitBranch, Bell } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function FloatingUI() {
  const { theme } = useTheme();
  const { scrollY } = useScroll();

  const y1 = useTransform(scrollY, [0, 800], [0, -120]);
  const y2 = useTransform(scrollY, [0, 800], [0, -180]);
  const y3 = useTransform(scrollY, [0, 800], [0, -80]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>
      
      {/* ── Field Palette Mockup (Fixed positioning relative to section) ── */}
      <motion.div
        style={{
          position: 'absolute', left: '8%', top: '25%', y: y2,
          display: theme === 'light' ? 'none' : 'flex', // Only in dark for hero variety, or both? Let's use both.
          flexDirection: 'column', gap: '8px',
          padding: '16px', borderRadius: '14px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          backdropFilter: 'blur(12px)', width: '180px',
          boxShadow: 'var(--shadow-lg)',
        }}
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 1 }}
      >
        <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Components</p>
        {[
          { icon: Type, label: 'Text Input' },
          { icon: CheckSquare, label: 'Checkbox' },
          { icon: List, label: 'Dropdown' }
        ].map((item, i) => (
          <div key={i} style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            padding: '8px', borderRadius: '8px', 
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)' 
          }}>
            <item.icon size={13} strokeWidth={2.5} />
            {item.label}
          </div>
        ))}
        <div style={{ 
          marginTop: '4px', height: '2px', background: 'var(--accent)', 
          width: '60%', borderRadius: '99px', opacity: 0.4 
        }} />
      </motion.div>

      {/* ── Logic Node Mockup ── */}
      <motion.div
        style={{
          position: 'absolute', right: '12%', top: '35%', y: y1,
          padding: '16px', borderRadius: '16px',
          background: 'var(--bg-base)', border: '1px solid var(--accent-3)',
          boxShadow: '0 0 30px rgba(236, 72, 153, 0.1)',
          width: '240px', display: 'flex', flexDirection: 'column', gap: '12px'
        }}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.7, duration: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(236,72,153,0.1)', color: 'var(--accent-3)' }}>
            <GitBranch size={14} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Conditional Logic</span>
        </div>
        <div style={{ 
          fontSize: '11px', color: 'var(--text-secondary)', padding: '10px', 
          borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)' 
        }}>
          IF <span style={{ color: 'var(--accent-3)', fontWeight: 700 }}>"Plan"</span> is <span style={{ color: 'var(--accent-3)', fontWeight: 700 }}>"Pro"</span>
          <br />SHOW <span style={{ color: 'var(--accent)', fontWeight: 700 }}>"Advanced Settings"</span>
        </div>
      </motion.div>

      {/* ── Submission Notification Mockup ── */}
      <motion.div
        style={{
          position: 'absolute', right: '22%', top: '75%', y: y3,
          padding: '12px 16px', borderRadius: '14px',
          background: 'var(--bg-surface)', border: '1px solid var(--success)',
          color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 10px 40px rgba(16, 185, 129, 0.1)',
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
          <Bell size={16} />
        </div>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>New Submission</p>
          <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0 }}>Form "Product Survey" • Just now</p>
        </div>
      </motion.div>

    </div>
  );
}
