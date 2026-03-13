import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import LandingNavbar from '../components/landing/LandingNavbar';
import Hero from '../components/landing/Hero';
import TrustedSection, { TRUST_ITEMS } from '../components/landing/TrustedSection';
import Features from '../components/landing/Features';
import ProductOverview from '../components/landing/ProductOverview';
import CTA from '../components/landing/CTA';
import Footer from '../components/landing/Footer';
import styles from '../styles/Home.module.css';

/**
 * Public landing page.
 * - Authenticated → /dashboard
 * - Unauthenticated → render landing experience
 */
export default function IndexPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.push('/dashboard');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  if (loading || user) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg-base)',
      }}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>FormCraft - Modern Form Operations Platform</title>
      </Head>

      <div className={styles.page}>
        <LandingNavbar />
        <main className={styles.main}>
          <Hero />
          {TRUST_ITEMS.length > 0 ? <TrustedSection items={TRUST_ITEMS} /> : null}
          <Features />
          <ProductOverview />
          <CTA />
        </main>
        <Footer />
      </div>
    </>
  );
}
