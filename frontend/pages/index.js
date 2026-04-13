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
    if (loading || user) return;

    const targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    if (typeof window.IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

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
  }, [loading, user]);

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
        <title>FormCraft — Build elegant forms at lightning speed</title>
        <meta name="description" content="A premium form operations platform. Build dynamic workflows, enforce validation, and construct beautiful data experiences." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <div id="landing-layout" className={styles.page}>
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
