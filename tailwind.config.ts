import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      scrollbar: {
        thin: '8px',
        thumb: {
          DEFAULT: '#a0aec0', // gray-400
          hover: '#718096',   // gray-500
          'gray-300': '#D1D5DB', // Added for scrollbar-thumb-gray-300
        },
        track: {
          DEFAULT: 'transparent',
        },
      },
    },
  },
  plugins: [
    // If you were using tailwind-scrollbar plugin, it would be added here:
    // require('tailwind-scrollbar'),
    function ({ addUtilities, theme, e }: any) {
      const scrollbarUtilities = {
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
        },
        '.scrollbar-thumb-gray-300': {
          '--scrollbar-thumb': theme('colors.gray.300'),
          'scrollbar-color': 'var(--scrollbar-thumb) transparent',
        },
        '.dark .dark\:scrollbar-thumb-slate-500': {
            '--scrollbar-thumb': theme('colors.slate.500'),
            'scrollbar-color': 'var(--scrollbar-thumb) transparent',
        },
        // Add other scrollbar utilities if needed, e.g., for track color
      };
      addUtilities(scrollbarUtilities, ['responsive', 'hover', 'dark']);
    }
  ],
};
export default config; 