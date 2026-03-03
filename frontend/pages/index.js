import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { getMe } from '../services/api';

/**
 * Root redirect page.
 * - Authenticated → /dashboard
 * - Unauthenticated → /login
 */
export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    getMe()
      .then(() => router.replace('/dashboard'))
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-base)',
    }}>
      <span className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  );
}
