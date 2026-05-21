/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Theme switching is handled via CSS variables defined in `src/index.css`.
  // Each Tailwind color reads from a CSS var so toggling a `[data-theme]`
  // attribute on <html> repaints the entire app without reloading.
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        income: 'rgb(var(--c-income) / <alpha-value>)',
        overspend: 'rgb(var(--c-overspend) / <alpha-value>)',
        projected: 'rgb(var(--c-projected) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        cardHover: '0 4px 12px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
}
