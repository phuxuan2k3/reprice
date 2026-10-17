/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FDECEA",
          100: "#FAD5D2",
          200: "#F5ABA6",
          300: "#EE7B74",
          400: "#E8544C",
          500: "#E53935",
          600: "#C62828",
          700: "#A52222",
          800: "#8A1F1F",
          900: "#6E1A1A",
        },
        ink: {
          900: "#1F2937",
          700: "#374151",
          500: "#6B7280",
          400: "#9CA3AF",
        },
        navy: {
          900: "#0F1B2D",
          800: "#16243A",
          700: "#1E3252",
          600: "#28406A",
        },
        teal: {
          50: "#E6F7F7",
          500: "#0EA5A5",
          600: "#0B8383",
        },
        mist: "#F7F7F8",
      },
      fontFamily: {
        sans: ["Inter", "Be Vietnam Pro", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08)",
        lift: "0 12px 28px rgba(16, 24, 40, 0.12)",
      },
    },
  },
  plugins: [],
};
