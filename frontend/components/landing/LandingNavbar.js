import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../../styles/Home.module.css';
import { useTheme } from '../../context/ThemeContext';

export default function LandingNavbar() {
    const [scrolled, setScrolled] = useState(false);
    const { theme, toggleTheme } = useTheme();

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
                    <div className={styles.navLinksPill}>
                        <Link href="/" className={`${styles.brand} ${styles.brandStart}`}>⚡ FormCraft</Link>

                        <Link href="/" className={styles.navLinkPill}>⌂ Home</Link>
                        <a href="#features" className={styles.navLinkPill}>◇ Features</a>
                        <Link href="/login" className={styles.navLinkPill}>→ Login</Link>
                        <Link href="/register" className={`${styles.navLinkPill} ${styles.navLinkPrimary}`}>✦ Signup</Link>

                        <button
                            type="button"
                            className="theme-toggle-btn"
                            onClick={(e) => toggleTheme(e)}
                            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                            aria-label="Toggle theme"
                        >
                            <span className={`theme-toggle-icon ${theme === 'dark' ? 'icon-sun' : 'icon-moon'}`}>
                                {theme === 'dark' ? '☀️' : '🌙'}
                            </span>
                        </button>
                    </div>
                </nav>
            </div>
        </header>
    );
}
