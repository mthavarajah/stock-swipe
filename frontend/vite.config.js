import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND = process.env.VITE_API_URL || 'http://localhost:8000'

function rewriteToStock(path, subpath) {
  const [, search] = path.split('?')
  const p = new URLSearchParams(search)
  const ticker = p.get('ticker') ?? ''
  const extra  = subpath === 'history' ? `?period=${p.get('period') ?? '1M'}` : ''
  return `/stock/${ticker.toUpperCase()}/${subpath}${extra}`
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/api/history': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => rewriteToStock(path, 'history'),
      },
      '/api/quote': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => rewriteToStock(path, 'quote'),
      },
      '/api/news': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => rewriteToStock(path, 'news'),
      },
    },
  },
})
