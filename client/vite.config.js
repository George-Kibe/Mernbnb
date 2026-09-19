import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The client calls the API at /api (same origin, like the Vercel
    // deployment), so in development forward those requests to Express.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
