/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'
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
 * A visible build identity, so it is possible to tell from the device itself
 * which build is running. package.json's version alone cannot answer that —
 * it stays 0.1.0 across every deploy — so the commit is appended to it.
 */
function resolveBuildVersion(): string {
  const { version } = JSON.parse(
    readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
  ) as { version: string }

  const sha = process.env.GITHUB_SHA ?? readGitSha()
  return sha ? `${version}+${sha.slice(0, 7)}` : version
}

function readGitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // A tarball checkout with no git metadata still has to build.
    return null
  }
}

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
  define: {
    __APP_VERSION__: JSON.stringify(resolveBuildVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The generated registerSW.js only registers once, on `load`. An iOS
      // home-screen app is resumed rather than reloaded, so that snippet can
      // go days without ever asking whether a new worker exists. src/lib/
      // serviceWorker.ts registers by hand and re-checks on every foreground.
      injectRegister: null,
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
        // HTML is deliberately absent: see the navigation route below.
        globPatterns: ['**/*.{js,css,svg,png,ico,woff,woff2}'],
        cleanupOutdatedCaches: true,
        // Both are what make an update land without a reinstall: the new
        // worker activates instead of waiting for every tab to close, and it
        // takes over the open page immediately. Set explicitly rather than
        // relying on what registerType: 'autoUpdate' happens to imply.
        clientsClaim: true,
        skipWaiting: true,
        // Explicitly off. The plugin otherwise defaults it to index.html,
        // which registers a NavigationRoute bound to the *precached* copy —
        // cache-first, and exactly how an old index.html gets pinned forever.
        // With index.html out of the precache that handler would also throw
        // at startup and take the whole worker down with it. Navigations go
        // through the NetworkFirst route below instead.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            // Explicit NetworkOnly so no future default can start caching data.
            urlPattern: SUPABASE_URL_PATTERN,
            handler: 'NetworkOnly',
          },
          {
            // index.html names the hashed asset files, so a stale copy of it
            // pins a stale app. It must never be answered from cache before
            // the network has been asked. The cache is the offline fallback
            // only, which keeps the installed app working with no signal.
            urlPattern: ({ request }: { request: Request }) =>
              request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              // Falls back to the last good shell rather than hanging on a
              // network that accepts the connection and then stalls.
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
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
