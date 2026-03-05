import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const rippleRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fc-theme') || 'dark';
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } catch (e) {}
    setMounted(true);
  }, []);

  // Circular-ripple wipe: expands from click position → covers screen → applies theme → shrinks out
  const toggleTheme = useCallback((event) => {
    if (transitioning) return;

    const next = theme === 'dark' ? 'light' : 'dark';

    // Calculate ripple origin (button center, or screen center as fallback)
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (event?.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }

    // Max radius needed to cover entire screen from origin
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    // If View Transitions API is supported, use it for a native-quality clip-path wipe
    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => {
        setTheme(next);
        try { localStorage.setItem('fc-theme', next); } catch (e) {}
        document.documentElement.setAttribute('data-theme', next);
      });

      // Inject a dynamic clip-path expanding circle via a <style> tag
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        ::view-transition-old(root) { animation: none; }
        ::view-transition-new(root) {
          animation: theme-ripple-clip 0.55s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          clip-path: circle(0px at ${x}px ${y}px);
        }
        @keyframes theme-ripple-clip {
          to { clip-path: circle(${maxRadius}px at ${x}px ${y}px); }
        }
      `;
      document.head.appendChild(styleEl);
      transition.finished.finally(() => styleEl.remove());
      return;
    }

    // Fallback: manual ripple overlay div for browsers without View Transitions API
    setTransitioning(true);

    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: fixed;
      z-index: 99999;
      border-radius: 50%;
      pointer-events: none;
      left: ${x}px;
      top: ${y}px;
      width: 0px; height: 0px;
      transform: translate(-50%, -50%);
      transition: width 0.55s cubic-bezier(0.4,0,0.2,1),
                  height 0.55s cubic-bezier(0.4,0,0.2,1),
                  opacity 0.15s ease 0.45s;
      background: ${next === 'light' ? '#F0F2F8' : '#060612'};
      opacity: 1;
    `;
    document.body.appendChild(ripple);
    rippleRef.current = ripple;

    // Trigger expansion on next frame
    requestAnimationFrame(() => {
      const d = maxRadius * 2 + 20;
      ripple.style.width = `${d}px`;
      ripple.style.height = `${d}px`;
    });

    // Apply theme at the halfway point so it's hidden under the ripple
    setTimeout(() => {
      setTheme(next);
      try { localStorage.setItem('fc-theme', next); } catch (e) {}
      document.documentElement.setAttribute('data-theme', next);
    }, 280);

    // Fade out ripple after full expansion
    setTimeout(() => {
      ripple.style.opacity = '0';
      setTimeout(() => {
        ripple.remove();
        setTransitioning(false);
      }, 200);
    }, 480);
  }, [theme, transitioning]);

  // Avoid flash — hide until hydrated
  if (!mounted) {
    return (
      <div style={{ visibility: 'hidden', minHeight: '100vh', background: '#060612' }} />
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
