/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ip: {
          bg: "#0a0e14",
          panel: "#111826",
          panel2: "#161f30",
          border: "#232f42",
          text: "#e2e8f0",
          muted: "#7c8aa3",
          accent: "#3ba7ff",
          green: "#3ecf8e",
          yellow: "#e8b339",
          red: "#f2545b",
          blue: "#3ba7ff",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.4)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "slide-in": {
          from: { transform: "translateX(12px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "flash-border": {
          "0%": { borderColor: "#3ba7ff" },
          "100%": { borderColor: "#232f42" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "slide-in": "slide-in 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "flash-border": "flash-border 1.8s ease-out",
      },
    },
  },
  plugins: [],
};
