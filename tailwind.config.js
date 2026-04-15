/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b1020',
        surface: '#061233',
        card: 'rgba(255, 255, 255, 0.04)',
        glass: 'rgba(255, 255, 255, 0.02)',
        primary: {
          DEFAULT: '#7c3aed',
          dark: '#4f46e5',
        },
        accent: {
          DEFAULT: '#60a5fa',
        },
        muted: '#9fb1c7',
        text: '#e6eef8',
        border: 'rgba(255, 255, 255, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
