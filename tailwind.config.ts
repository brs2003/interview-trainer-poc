import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        cream: '#F7F4EE',
        olive: {
          DEFAULT: '#2F3B2C',
          light: '#3D4B39',
          dark: '#232C21',
        },
        terracotta: {
          DEFAULT: '#D9784F',
          dark: '#C4643C',
          light: '#F0DDD1',
        },
        hairline: '#E5E0D6',
        muted: '#6B6660',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'wave': 'wave 1.5s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1.2)' },
        },
      }
    },
  },
  plugins: [],
};
export default config;
