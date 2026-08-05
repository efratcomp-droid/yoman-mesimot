/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FBF7F3',
        card: '#FFFFFF',
        plum: '#4A2C52',
        rose: '#C15F86',
        amber: '#C98A2E',
        sage: '#3F8F72',
        lilac: '#EFE8F1',
        muted: '#7C6E80',
        line: '#E7DEE8',
      },
      fontFamily: {
        heading: ['"Frank Ruhl Libre"', 'serif'],
        sans: ['Assistant', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
