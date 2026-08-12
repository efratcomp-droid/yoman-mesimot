/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Anything served from a Supabase project. Task data must always come from the
 * network (or from IndexedDB via the app's own offline queue) — never from a
 * stale service-worker cache, which would silently show outdated tasks.
 */
const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\//i

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'יומן משימות',
        short_name: 'משימות',
        description: 'יומן משימות אישי מסונכרן',
        dir: 'rtl',
        lang: 'he',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#4A2C52',
        background_color: '#FBF7F3',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precached so the shell opens instantly and works with no network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [SUPABASE_URL_PATTERN],
        runtimeCaching: [
          {
            // Explicit NetworkOnly so no future default can start caching data.
            urlPattern: SUPABASE_URL_PATTERN,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
