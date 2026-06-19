/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        solid: {
          base: 'var(--bg-solid-base)',
          surface: 'var(--bg-solid-surface)',
          'surface-elevated': 'var(--bg-solid-surface-elevated)',
          panel: 'var(--bg-solid-panel)',
          card: 'var(--bg-solid-card)',
          element: 'var(--bg-solid-element)',
          active: 'var(--bg-solid-active)',
          nested: 'var(--bg-solid-nested)'
        }
      },
      animation: {
        'image-change': 'image-fade 0.3s ease-out',
      },
      keyframes: {
        'image-fade': {
          '0%': { opacity: '0.5', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
