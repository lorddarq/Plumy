import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages will serve from /Plumy/ path
  base: '/Plumy/',
  root: './pages',
  build: {
    outDir: '../dist-pages',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './pages/src'),
    },
  },
})
