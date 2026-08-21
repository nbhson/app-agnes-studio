/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        agnes: {
          bg: '#0a0a0f',
          surface: '#12121a',
          card: '#1a1a2e',
          border: '#2d2d44',
          accent: '#7c3aed',
          accentLight: '#a78bfa',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
          text: '#e2e8f0',
          muted: '#64748b',
        },
      },
    },
  },
  plugins: [],
}
