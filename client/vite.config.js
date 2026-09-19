import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEFAULT_SITE_URL = 'https://mernbnb.vercel.app'

// Public address of the site (VITE_SITE_URL), for canonical links and share
// previews: %SITE_URL% in index.html and import.meta.env.VITE_SITE_URL in
// src/lib/seo.js. Keep it in sync with the API's SITE_URL.
const siteUrl = () => {
  let url = DEFAULT_SITE_URL
  return {
    name: 'site-url',
    config(config, { mode }) {
      url = (loadEnv(mode, config.root ?? process.cwd(), 'VITE_').VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
      return { define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(url) } }
    },
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl()],
  server: {
    // The client calls the API at /api (same origin, like the Vercel
    // deployment), so in development forward those requests to Express,
    // along with the sitemap and robots.txt it generates.
    proxy: {
      '/api': 'http://localhost:5000',
      '/sitemap.xml': 'http://localhost:5000',
      '/robots.txt': 'http://localhost:5000',
    },
  },
})
