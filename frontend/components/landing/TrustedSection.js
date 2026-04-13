import { motion } from 'framer-motion';

export const TRUST_ITEMS = [
  { value: '9 Permissions', label: 'Role-based governance' },
  { value: 'Multi-level', label: 'Approval workflows' },
  { value: 'Dynamic', label: 'Form models' },
  { value: 'Centralized', label: 'Audit logging' },
];

export default function TrustedSection({ items = TRUST_ITEMS }) {
  if (!items?.length) return null;
  return (
    <section style={{ padding: '72px 24px', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Top gradient divider */}
        <div style={{
          height: '1px', marginBottom: '60px',
          background: 'linear-gradient(to right, transparent, var(--accent), var(--accent-2), transparent)',
          opacity: 0.3,
        }} />

        <motion.div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '40px', textAlign: 'center' }}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          {items.map((item) => (
            <div key={item.label}>
              <p style={{
                fontFamily: 'Outfit, sans-serif', fontWeight: 800,
                fontSize: '30px', letterSpacing: '-0.03em',
                color: 'var(--accent)', marginBottom: '5px',
              }}>
                {item.value}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {item.label}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Bottom gradient divider */}
        <div style={{
          height: '1px', marginTop: '60px',
          background: 'linear-gradient(to right, transparent, var(--accent-2), var(--accent), transparent)',
          opacity: 0.3,
        }} />
      </div>
    </section>
  );
}
