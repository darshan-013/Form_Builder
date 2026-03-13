import styles from '../../styles/Home.module.css';

const OVERVIEW_POINTS = [
    {
        heading: 'Form Lifecycle Control',
        text: 'Manage draft, publish, update, soft-delete, and restore flows without losing traceability.',
    },
    {
        heading: 'Role-Centric Administration',
        text: 'Empower Admin and Role Administrator workflows with clean, dedicated management surfaces.',
    },
    {
        heading: 'Visibility by Design',
        text: 'Configure role-based form visibility while preserving privileged oversight where required.',
    },
];

export default function ProductOverview() {
    return (
        <section id="overview" className={`${styles.section} ${styles.sectionAlt} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>A system built for real internal processes</h2>
                    <p className={styles.sectionDesc}>
                        FormCraft combines builder flexibility with governance controls so teams can move faster without losing control.
                    </p>
                </div>

                <div className={styles.overviewGrid}>
                    {OVERVIEW_POINTS.map((item) => (
                        <article key={item.heading} className={`${styles.card} ${styles.overviewCard}`}>
                            <h3 className={styles.cardTitle}>{item.heading}</h3>
                            <p className={styles.cardDesc}>{item.text}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

