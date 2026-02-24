/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"]
      },
      colors: {
        brand: {
          50: "#f6f8ee",
          100: "#e8efd0",
          300: "#bfd88d",
          500: "#8bad45",
          700: "#597228",
          900: "#334116"
        },
        ink: "#101611",
        clay: "#efe8da"
      },
      boxShadow: {
        panel: "0 20px 45px -28px rgba(16, 22, 17, 0.45)"
      }
    }
  },
  plugins: []
};
