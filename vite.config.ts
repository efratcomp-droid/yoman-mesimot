/// <reference types="vitest/config" />
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Anything served from a Supabase project. Task data must always come from the
 * network (or from IndexedDB via the app's own offline queue) — never from a
 * stale service-worker cache, which would silently show outdated tasks.
 */
const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\//i

/** GitHub Pages serves this repo from a project subpath, not the domain root. */
const BASE = '/yoman-mesimot/'

/**
 * GitHub Pages has no server-side rewrite, so a deep link (or a hard refresh on
 * one) 404s before the service worker exists to answer it. Pages serves
 * 404.html for those, so shipping a copy of index.html under that name makes the
 * very first load of any path boot the app. It is deliberately left out of the
 * precache manifest: once the SW is installed, navigateFallback handles this.
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The icons live in public/ and are already covered by globPatterns
      // below, so listing them in includeAssets would only duplicate entries.
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
        globIgnores: ['404.html'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Must carry the base path: the SW is scoped to the project subpath.
        navigateFallback: `${BASE}index.html`,
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
    // Last, so its closeBundle runs after the service worker is generated and
    // 404.html stays out of the precache manifest.
    spaFallback(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
