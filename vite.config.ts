import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'SquadSync — Cricket Analytics',
        short_name: 'SquadSync',
        description: 'Live scoring, team selection and match analytics for cricket teams.',
        theme_color: '#1b5e3a',
        background_color: '#f6f3ec',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Live-scoring data must never be served stale from cache; only the app shell is cached.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
})
