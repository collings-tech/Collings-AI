module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#2D3748',
        },
        brand: {
          50:  '#f0fbfc',
          100: '#d9f5f7',
          200: '#aae4ea',
          300: '#7dd5de',
          400: '#55c5d0',
          500: '#30aebb',
          600: '#2290a0',
          700: '#1d7585',
          800: '#1c5e6d',
          900: '#1b4e5c',
          950: '#0d3040',
        },
      },
      animation: {
        'bounce': 'bounce 1.2s infinite',
      },
    },
  },
  plugins: [],
};
