import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effaf9",
          100: "#d3f2ef",
          600: "#0f766e",
          700: "#0b5f59",
          800: "#0a4a46",
        },
        ink: { DEFAULT: "#1b2430", soft: "#47546a" },
      },
      maxWidth: { prose2: "46rem" },
    },
  },
  plugins: [],
};

export default config;
