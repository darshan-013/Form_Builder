import { FileCode2, Users, SlidersHorizontal } from 'lucide-react';
import styles from '../../styles/Home.module.css';

const OVERVIEW_POINTS = [
    {
        heading: 'Form Lifecycle Control',
        text: 'Manage draft, publish, update, soft-delete, and restore flows without losing traceability.',
        icon: FileCode2,
    },
    {
        heading: 'Role-Centric Administration',
        text: 'Empower Admin and Role Administrator workflows with clean, dedicated management surfaces.',
        icon: Users,
    },
    {
        heading: 'Granular Access Control',
        text: 'Configure role-based form access with explicit user permissions while preserving privileged oversight.',
        icon: SlidersHorizontal,
    },
];

export default function ProductOverview() {
    return (
        <section id="overview" className={`${styles.section} ${styles.sectionAlt} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.sectionHeaderCenter}>
                    <h2 className={styles.sectionTitle}>A system built for real internal processes</h2>
                    <p className={styles.sectionDesc}>
                        FormCraft combines builder flexibility with governance controls so teams can move faster without losing control.
                    </p>
                </div>

                <div className={styles.overviewGrid}>
                    {OVERVIEW_POINTS.map((item, idx) => {
                        const IconComponent = item.icon;
                        return (
                            <article key={idx} className={styles.bentoCard}>
                                <div className={styles.iconWrapper}>
                                    <IconComponent size={24} strokeWidth={2} />
                                </div>
                                <h3 className={styles.cardTitle}>{item.heading}</h3>
                                <p className={styles.cardDesc}>{item.text}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

