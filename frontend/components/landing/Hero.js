import Link from 'next/link';
import styles from '../../styles/Home.module.css';

export default function Hero() {
    return (
        <section className={`${styles.heroSection} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.heroGlow} />
                <div className={styles.heroContent}>
                    <p className={styles.kicker}>Modern Form Operations Platform</p>
                    <h1 className={styles.heroTitle}>
                        Run enterprise form workflows with speed, clarity, and control.
                    </h1>
                    <p className={styles.heroDesc}>
                        Build dynamic forms, enforce role-based access, and track every critical event
                        in one premium workspace designed for real operations teams.
                    </p>

                    <div className={styles.heroActions}>
                        <Link href="/register" className={`${styles.ctaButton} ${styles.btnPrimary}`}>Get Started</Link>
                        <Link href="/login" className={`${styles.ctaButton} ${styles.btnSecondary}`}>Login</Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

