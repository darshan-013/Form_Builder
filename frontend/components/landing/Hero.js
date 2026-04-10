import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import styles from '../../styles/Home.module.css';
import BackgroundShapes from './BackgroundShapes';

export default function Hero() {
    return (
        <section className={`${styles.heroSection} ${styles.reveal}`} data-reveal>
            <BackgroundShapes />
            <div className={styles.container}>
                <div className={styles.heroGlow} />
                <div className={styles.heroContent}>
                    <div className={styles.badge}>
                        <Sparkles size={14} />
                        <span>FormCraft v2 is now live</span>
                    </div>
                    
                    <h1 className={styles.heroTitle}>
                        Build elegant forms.<br />
                        <span className={styles.heroHighlight}>At lightning speed.</span>
                    </h1>
                    
                    <p className={styles.heroDesc}>
                        A premium form operations platform designed for scale. 
                        Build dynamic workflows, enforce strict validation, and construct beautiful 
                        data experiences without writing a single line of backend logic.
                    </p>

                    <div className={styles.heroActions}>
                        <Link href="/register" className={styles.btnPrimaryLg}>
                            Start Building Free
                            <ArrowRight size={18} />
                        </Link>
                        <Link href="#features" className={styles.btnSecondaryLg}>
                            Explore Platform
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

