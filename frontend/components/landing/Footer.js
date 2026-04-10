import Link from 'next/link';
import { Zap } from 'lucide-react';
import styles from '../../styles/Home.module.css';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={styles.container}>
                <div className={styles.footerInner}>
                    <div className={styles.brand}>
                        <Zap className={styles.brandIcon} size={20} />
                        FormCraft
                    </div>
                    <div className={styles.footerLinks}>
                        <a href="#features">Features</a>
                        <a href="#overview">Overview</a>
                        <Link href="/login">Login</Link>
                        <Link href="/register">Get Started</Link>
                    </div>
                    <p className={styles.footerCopy}>© {new Date().getFullYear()} FormCraft. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}

