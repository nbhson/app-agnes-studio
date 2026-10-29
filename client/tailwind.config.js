/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // RGB channel variables set per-theme in globals.css — one token set,
        // two themes (R2-11). Opacity modifiers keep working via <alpha-value>.
        agnes: {
          bg: 'rgb(var(--agnes-bg) / <alpha-value>)',
          surface: 'rgb(var(--agnes-surface) / <alpha-value>)',
          card: 'rgb(var(--agnes-card) / <alpha-value>)',
          border: 'rgb(var(--agnes-border) / <alpha-value>)',
          accent: 'rgb(var(--agnes-accent) / <alpha-value>)',
          accentLight: 'rgb(var(--agnes-accent-light) / <alpha-value>)',
          success: 'rgb(var(--agnes-success) / <alpha-value>)',
          warning: 'rgb(var(--agnes-warning) / <alpha-value>)',
          error: 'rgb(var(--agnes-error) / <alpha-value>)',
          text: 'rgb(var(--agnes-text) / <alpha-value>)',
          heading: 'rgb(var(--agnes-heading) / <alpha-value>)',
          muted: 'rgb(var(--agnes-muted) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
