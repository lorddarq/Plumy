/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'nordic': {
          'bg': '#F8F9FA',
          'white': '#FFFFFF',
          'gray-50': '#F5F6F7',
          'gray-100': '#E8EAED',
          'gray-200': '#DFE1E5',
          'gray-300': '#C1C7CD',
          'gray-400': '#9AA0A6',
          'gray-500': '#70757A',
          'gray-600': '#5F6368',
          'gray-700': '#3C4043',
          'gray-800': '#202124',
          'blue': '#6B9AC4',
          'green': '#8BA888',
          'purple': '#9B87B5',
        },
      },
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
    },
  },
  plugins: [],
}
