import Link from 'next/link';
import styles from '../../styles/Home.module.css';

export default function CTA() {
    return (
        <section className={`${styles.ctaSection} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={`${styles.card} ${styles.ctaCard}`}>
                    <h2 className={styles.ctaTitle}>Start managing forms with confidence</h2>
                    <p className={styles.ctaDesc}>
                        Launch your workspace, assign access clearly, and keep every critical action traceable from day one.
                    </p>
                    <div className={styles.heroActions}>
                        <Link href="/register" className={`${styles.ctaButton} ${styles.btnPrimary}`}>Create Account</Link>
                        <Link href="/login" className={`${styles.ctaButton} ${styles.btnSecondary}`}>Sign In</Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

