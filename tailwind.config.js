/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        subtle: 'var(--subtle)',
        line: 'var(--border)',
        brand: 'var(--brand)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'brand-soft': 'var(--brand-soft)',
        violet: 'var(--violet)',
        'violet-soft': 'var(--violet-soft)',
        success: 'var(--success)',
        'success-soft': 'var(--success-soft)',
        warning: 'var(--warning)',
        'warning-soft': 'var(--warning-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
      },
      fontFamily: {
        display: ['Hanken Grotesk', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,27,58,0.04), 0 8px 24px -12px rgba(11,27,58,0.12)',
      },
    },
  },
  plugins: [],
}
