import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development', // Only in dev
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for core React libraries
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Icons chunk
          icons: ['lucide-react'],
          // Utility libraries chunk
          utils: ['axios'],
        }
      }
    },
    // Optimize bundle size
    chunkSizeWarningLimit: 1000,
    target: 'es2015'
  },

  // Development server configuration
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // API proxy with enhanced error handling
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        timeout: 30000,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('API Proxy error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying API request:', req.method, req.url);
          });
        }
      },
      
      // BM25 service proxy
      '/bm25': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/bm25/, ''),
        timeout: 10000,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('BM25 Proxy error:', err.message);
          });
        }
      },
      
      // WebSocket proxy for SSE
      '/ws': {
        target: 'ws://localhost:3003',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  },

  // Preview server configuration (for production builds)
  preview: {
    port: 4173,
    host: '0.0.0.0'
  },

  // Optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'axios',
      'lucide-react'
    ]
  },

  // CSS configuration
  css: {
    devSourcemap: true
  },

  // Define global constants
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __VERSION__: JSON.stringify('2.0.0')
  },

  // ESBuild configuration
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
})