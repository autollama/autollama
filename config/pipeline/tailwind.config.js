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
        // Pipeline theme colors
        pipeline: {
          bg: '#0a0e27',
          primary: '#00d4ff',
          secondary: '#1a1f3a',
          accent: '#00ff7f',
          text: '#e2e8f0',
          muted: '#64748b'
        },
        // Status colors
        status: {
          processing: '#fbbf24', // yellow
          completed: '#10b981',   // green
          queued: '#3b82f6',      // blue
          error: '#ef4444'        // red
        }
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'chunk-flow': 'chunk-flow var(--animation-duration) linear infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out'
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(0, 212, 255, 0.8)',
            transform: 'scale(1)'
          },
          '50%': { 
            boxShadow: '0 0 40px rgba(0, 212, 255, 1)',
            transform: 'scale(1.05)'
          }
        },
        'chunk-flow': {
          'from': { offsetDistance: '0%' },
          'to': { offsetDistance: '100%' }
        },
        'fade-in': {
          'from': { opacity: '0' },
          'to': { opacity: '1' }
        },
        'slide-up': {
          'from': { 
            opacity: '0',
            transform: 'translateY(10px)'
          },
          'to': { 
            opacity: '1',
            transform: 'translateY(0)'
          }
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}