import React from 'react';
import { useRouter } from 'next/router';
import Navbar from '../Navbar';
import Container from '../ui/Container';

export default function AppLayout({ children }) {
  const router = useRouter();
  
  // Pages where we show NOTHING (raw component only)
  // Usually landing page, login, register have their own full-page layouts
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const isLandingPage = router.pathname === '/';
  const isBuilderPage = router.pathname.startsWith('/builder');
  const isPreviewPage = router.pathname.startsWith('/preview');
  
  const hideLayout = isAuthPage || isLandingPage || isBuilderPage || isPreviewPage;

  if (hideLayout) {
    return (
      <div className="min-h-screen bg-main selection:bg-indigo-500/30">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main text-main selection:bg-indigo-500/30">
      {/* Background Glows for Modern SaaS Cyber Aesthetic */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />
        
        <main className="flex-1 w-full relative">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </main>

        <footer className="relative z-10 py-10 border-t border-gray-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-950/20 backdrop-blur-sm mt-auto">
          <Container className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm">
            <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <span className="text-indigo-600">Form</span>Craft
              <span className="text-[10px] font-normal px-2 py-0.5 bg-indigo-500/10 text-indigo-500 rounded-full">v4.0</span>
            </div>
            <p className="text-gray-500 dark:text-gray-400">© 2026 FormCraft Platform. All rights reserved.</p>
            <div className="flex gap-8 text-gray-400 dark:text-gray-500">
              <a href="#" className="hover:text-indigo-500 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-indigo-500 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-indigo-500 transition-colors">Help Center</a>
            </div>
          </Container>
        </footer>
      </div>
    </div>
  );
}
