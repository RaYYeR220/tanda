import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terracotta: "#B23A1E",
        cochineal: "#9E2A2B",
        marigold: "#E8A317",
        cempasuchil: "#F2820D",
        teal: "#2A7F7A",
        indigo: "#3B3A8C",
        purple: "#7B4B8A",
        cream: "#F7F0E1",
        bone: "#EFE6D2",
        ink: "#241712",
        inkdeep: "#1A0F0B",
        trust: {
          high: "#3E8E5A",
          mid: "#E8A317",
          low: "#8A8170",
          flag: "#C2362B",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
