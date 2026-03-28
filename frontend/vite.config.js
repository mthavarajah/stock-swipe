import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND = process.env.VITE_API_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    proxy: {
      // Local dev: forward news to FastAPI (Vercel RSS function handles prod)
      '/api/news': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => {
          const ticker = new URLSearchParams(path.split('?')[1]).get('ticker') ?? ''
          return `/stock/${ticker.toUpperCase()}/news`
        },
      },
    },
  },
})
