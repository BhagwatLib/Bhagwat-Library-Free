/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        skeuo: {
          darkBg: "#1A1D24",
          darkCard: "#252932",
          darkSurface: "#21252D",
          darkInset: "#1B1E25",
          darkBorder: "rgba(255, 255, 255, 0.07)",
          lightBg: "#ECECEC",
          lightCard: "#F4F4F4",
          lightSurface: "#EAEAEA",
          lightInset: "#E2E2E2",
          lightBorder: "rgba(0, 0, 0, 0.06)",
          accent: "#5B7FFF",
          accentHover: "#486DEB",
          success: "#36D399",
          warning: "#FBBF24",
          danger: "#EF4444",
        },
        primary: "#5B7FFF",
        success: "#36D399",
        danger: "#EF4444",
        warning: "#FBBF24",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

