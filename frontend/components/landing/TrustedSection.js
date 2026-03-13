import styles from '../../styles/Home.module.css';

export const TRUST_ITEMS = [
    { label: 'Role-based governance', value: '9 Core Permissions' },
    { label: 'Workflow-ready engine', value: 'Multi-level Approval' },
    { label: 'Scalable architecture', value: 'Dynamic Form Model' },
    { label: 'Audit traceability', value: 'Centralized Logs' },
];

export default function TrustedSection({ items = TRUST_ITEMS }) {
    if (!Array.isArray(items) || items.length === 0) return null;

    return (
        <section className={`${styles.section} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.sectionHeaderCenter}>
                    <h2 className={styles.sectionTitle}>Trusted foundations for internal operations</h2>
                    <p className={styles.sectionDesc}>
                        Built for teams that need secure data collection, permission control, and complete action visibility.
                    </p>
                </div>

                <div className={styles.trustGrid}>
                    {items.map((item) => (
                        <article key={item.label} className={`${styles.card} ${styles.trustCard}`}>
                            <p className={styles.trustValue}>{item.value}</p>
                            <p className={styles.trustLabel}>{item.label}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

