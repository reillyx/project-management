/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5B9BD5',
          dark: '#4A8BC2',
          deep: '#3D74A8',
          light: '#EAF3FB',
          soft: '#F0F6FC',
        },
        ink: {
          DEFAULT: '#2B3A4A',
          soft: '#6B7A90',
          faint: '#9AA7B8',
        },
        line: '#E1E8F0',
        hair: '#EEF2F7',
        canvas: '#F3F6FA',
      },
    },
  },
  plugins: [],
};