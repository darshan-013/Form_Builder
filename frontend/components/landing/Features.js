import styles from '../../styles/Home.module.css';

const FEATURES = [
    {
        title: 'Visual Form Builder',
        desc: 'Create, edit, and publish forms with grouped fields and strong validation controls.',
        icon: '🧩',
    },
    {
        title: 'Role-first Access Control',
        desc: 'Enforce single-role RBAC with clear permission boundaries across every workflow step.',
        icon: '🛡️',
    },
    {
        title: 'Approval Workflow',
        desc: 'Support multi-level review and role-aware approval visibility without process friction.',
        icon: '✅',
    },
    {
        title: 'Audit & Operational Logs',
        desc: 'Track role changes, publishing, submissions, and sensitive updates with confidence.',
        icon: '🔐',
    },
];

export default function Features() {
    return (
        <section id="features" className={`${styles.section} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Everything your team needs to run form operations</h2>
                    <p className={styles.sectionDesc}>
                        From creation to approvals and audit visibility, each layer is designed for operational scale.
                    </p>
                </div>

                <div className={styles.featureGrid}>
                    {FEATURES.map((feature) => (
                        <article key={feature.title} className={`${styles.card} ${styles.featureCard}`}>
                            <span className={styles.featureIcon}>{feature.icon}</span>
                            <h3 className={styles.cardTitle}>{feature.title}</h3>
                            <p className={styles.cardDesc}>{feature.desc}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

