import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, Sun, Moon } from 'lucide-react';
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
                    <Link href="/" className={styles.brand}>
                        <Zap className={styles.brandIcon} size={28} />
                        FormCraft
                    </Link>

                    <div className={styles.navLinks}>
                        <a href="#features" className={styles.navLink}>Features</a>
                        <a href="#overview" className={styles.navLink}>Platform</a>
                        
                        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }} />
                        
                        <Link href="/login" className={`${styles.navAction} ${styles.navLogin}`}>
                            Login
                        </Link>
                        <Link href="/register" className={`${styles.navAction} ${styles.navRegister}`}>
                            Get Started
                        </Link>

                        <button
                            type="button"
                            className={styles.navThemeButton}
                            onClick={(e) => toggleTheme(e)}
                            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    </div>
                </nav>
            </div>
        </header>
    );
}
