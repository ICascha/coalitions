import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import compression from 'vite-plugin-compression';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/coalitions/' : '/',
  plugins: [react(),     
  compression({
    algorithm: 'gzip',  // or 'brotliCompress', 'deflate', etc.
    ext: '.gz',         // extension to add to compressed files
    filter: /\.(js|mjs|json|css|html)$/i,  // files to compress
    threshold: 1024,    // minimum size to compress (in bytes)
    deleteOriginFile: false,  // keep original files
    verbose: true,      // log compression stats
  })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/leiden': {
        target: process.env.NODE_ENV === 'production'
          ? 'https://backendclustering-production.up.railway.app'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
      '/regression': {
        target: process.env.NODE_ENV === 'production'
          ? 'https://backendclustering-production.up.railway.app'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
      '/country-positions': {
        target: process.env.NODE_ENV === 'production'
          ? 'https://backendclustering-production.up.railway.app'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
      '/unga-distances': {
        target: process.env.NODE_ENV === 'production'
          ? 'https://backendclustering-production.up.railway.app'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
      '/fbic': {
        target: process.env.NODE_ENV === 'production'
          ? 'https://backendclustering-production.up.railway.app'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
      '/critical-goods': {
        target: process.env.NODE_ENV === 'production'
          ? 'https://backendclustering-production.up.railway.app'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
  },
})
