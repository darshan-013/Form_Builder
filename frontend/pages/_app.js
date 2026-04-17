import '../styles/globals.css';
import '../styles/landing.css';

import '../styles/auth.css';
import '../styles/builder.css';
import '../styles/dashboard.css';
import '../styles/form-renderer.css';
import '../styles/responsive.css';
import '../styles/roles.css';
import '../styles/users.css';
import '../styles/Sidebar.css';
import '../styles/docs.css';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef } from 'react';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import LocalToast from '../components/LocalToast';
import SmoothScroll from '../components/landing/SmoothScroll';
import SessionTimeoutManager from '../components/SessionTimeoutManager';

function routeRank(path) {
  if (!path) return 0;
  if (path.startsWith('/dashboard')) return 1;
  if (path.startsWith('/forms')) return 2;
  if (path.startsWith('/builder')) return 3;
  if (path.startsWith('/submissions')) return 4;
  if (path.startsWith('/roles')) return 5;
  if (path.startsWith('/users')) return 6;
  if (path.startsWith('/logs')) return 7;
  return 8;
}

const pageMotion = {
  enter: (direction) => ({ opacity: 0, x: direction > 0 ? 18 : -18, y: 2, filter: 'blur(1px)' }),
  center: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
  exit: (direction) => ({ opacity: 0, x: direction > 0 ? -14 : 14, y: -1, filter: 'blur(1px)' }),
};

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const prevPathRef = useRef(router.asPath);
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const isBuilderNewPage = router.pathname === '/builder/new';

  const direction = useMemo(() => {
    const prev = routeRank(prevPathRef.current);
    const next = routeRank(router.asPath);
    return next >= prev ? 1 : -1;
  }, [router.asPath]);

  useEffect(() => {
    prevPathRef.current = router.asPath;
  }, [router.asPath]);

  useEffect(() => {
    const lockClass = 'auth-scroll-lock';
    const html = document.documentElement;
    const body = document.body;

    if (isAuthPage) {
      html.classList.add(lockClass);
      body.classList.add(lockClass);
    } else {
      html.classList.remove(lockClass);
      body.classList.remove(lockClass);
    }

    return () => {
      html.classList.remove(lockClass);
      body.classList.remove(lockClass);
    };
  }, [isAuthPage]);

  useEffect(() => {
    const lockClass = 'builder-new-scroll-lock';
    const html = document.documentElement;
    const body = document.body;

    if (isBuilderNewPage) {
      html.classList.add(lockClass);
      body.classList.add(lockClass);
    } else {
      html.classList.remove(lockClass);
      body.classList.remove(lockClass);
    }

    return () => {
      html.classList.remove(lockClass);
      body.classList.remove(lockClass);
    };
  }, [isBuilderNewPage]);

  const isLandingPage = router.pathname === '/';
  const content = (
    <>
      <LocalToast />
      <SessionTimeoutManager />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={router.asPath}
          custom={direction}
          variants={pageMotion}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <Component {...pageProps} />
        </motion.div>
      </AnimatePresence>
    </>
  );

  return (
    <AuthProvider>
      <ThemeProvider>
        {isLandingPage ? (
          <SmoothScroll>{content}</SmoothScroll>
        ) : (
          content
        )}
      </ThemeProvider>
    </AuthProvider>
  );
}

