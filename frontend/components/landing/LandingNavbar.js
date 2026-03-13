import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../../styles/Home.module.css';

export default function LandingNavbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 16);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header className={`${styles.navbarWrap} ${scrolled ? styles.navbarSolid : styles.navbarTransparent}`}>
            <div className={styles.container}>
                <nav className={styles.navbar}>
                    <Link href="/" className={styles.brand}>
                        FormCraft
                    </Link>

                    <div className={styles.navLinks}>
                        <a href="#features" className={styles.navLink}>Features</a>
                        <a href="#overview" className={styles.navLink}>Overview</a>
                        <Link href="/login" className={styles.navLink}>Login</Link>
                        <Link href="/register" className={`${styles.ctaButton} ${styles.btnPrimarySm}`}>Get Started</Link>
                    </div>
                </nav>
            </div>
        </header>
    );
}

