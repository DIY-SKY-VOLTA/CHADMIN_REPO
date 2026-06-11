/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neutral: {
          250: '#dfdfdf',
          350: '#bbbbbb',
          450: '#8c8c8c',
          550: '#636363',
          605: '#4f4f4f',
          650: '#4a4a4a',
          750: '#333333',
          805: '#292929',
          850: '#1f1f1f',
          855: '#1c1c1c'
        },
        red: {
          550: '#e23131',
          650: '#d32222',
          655: '#cb1a1a'
        },
        amber: {
          550: '#e68804',
          605: '#cf7700'
        },
        emerald: {
          55: '#ecfdf5',
          550: '#0f9a6d'
        },
        blue: {
          550: '#3077d8'
        },
        purple: {
          650: '#8438cf'
        },
        indigo: {
          550: '#5a60d0'
        },
        rose: {
          650: '#d41e4d'
        }
      }
    },
  },
  plugins: [],
}
