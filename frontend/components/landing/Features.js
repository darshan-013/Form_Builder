import { Layers, ShieldCheck, Route, Fingerprint } from 'lucide-react';
import styles from '../../styles/Home.module.css';

const FEATURES = [
    {
        title: 'Visual Form Builder',
        desc: 'Construct powerful forms instantly. Drag, drop, and configure multi-page logic with real-time UI previews.',
        icon: Layers,
    },
    {
        title: 'Role-First Access',
        desc: 'Zero-trust architecture. Define strict access boundaries and assign viewing or editing rights surgically.',
        icon: ShieldCheck,
    },
    {
        title: 'Dynamic Routing',
        desc: 'Advanced submission logic. Design multi-step workflows with conditional routing based on form responses.',
        icon: Route,
    },
    {
        title: 'Compliance & Audit',
        desc: 'Enterprise-grade visibility. Every change, submission, and state transition is immutably logged for audit trails.',
        icon: Fingerprint,
    },
];

export default function Features() {
    return (
        <section id="features" className={`${styles.section} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.sectionHeaderCenter}>
                    <h2 className={styles.sectionTitle}>Engineered for scale and security</h2>
                    <p className={styles.sectionDesc}>
                        Stop writing boilerplate. FormCraft gives you everything you need to build, validate, and process complex operational data out of the box.
                    </p>
                </div>

                <div className={styles.featureGrid}>
                    {FEATURES.map((feature, idx) => {
                        const IconComponent = feature.icon;
                        return (
                            <article key={idx} className={styles.bentoCard}>
                                <div className={styles.iconWrapper}>
                                    <IconComponent size={24} strokeWidth={2} />
                                </div>
                                <h3 className={styles.cardTitle}>{feature.title}</h3>
                                <p className={styles.cardDesc}>{feature.desc}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

