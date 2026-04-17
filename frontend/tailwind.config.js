/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scope all Tailwind utilities to inside the #landing-layout wrapper
  important: '#landing-layout',
  // Match existing data-theme="dark" toggle pattern
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./pages/index.js",
    "./pages/docs.js",
    "./components/landing/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        surface: {
          light: '#ffffff',
          dark: '#0B0B1D',
          hoverLight: '#f8fafc',
          hoverDark: '#1E1E2E'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'grid-pan': 'gridPan 30s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        gridPan: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '32px 32px' },
        }
      }
    },
  },
  plugins: [],
}
