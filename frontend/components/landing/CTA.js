import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from '../../styles/Home.module.css';

export default function CTA() {
    return (
        <section className={`${styles.section} ${styles.reveal}`} data-reveal>
            <div className={styles.container}>
                <div className={styles.ctaBox}>
                    <h2 className={styles.ctaTitle}>Start managing forms with confidence</h2>
                    <p className={styles.ctaDesc}>
                        Launch your workspace, assign access clearly, and keep every critical action traceable from day one.
                    </p>
                    <div className={styles.heroActions}>
                        <Link href="/register" className={styles.btnPrimaryLg}>
                            Create Free Account
                            <ArrowRight size={18} />
                        </Link>
                        <Link href="/login" className={styles.btnSecondaryLg}>
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

