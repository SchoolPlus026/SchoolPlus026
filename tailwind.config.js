/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#f8fafc', // slate-50
        surface: '#ffffff',
        card: '#ffffff',
        glass: 'rgba(255, 255, 255, 0.8)',
        primary: {
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
        },
        accent: {
          DEFAULT: '#818cf8',
        },
        muted: '#64748b',
        text: '#1e293b',
        border: '#e2e8f0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
