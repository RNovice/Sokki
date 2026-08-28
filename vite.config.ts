import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: {
    // Write React, ship Preact. Removing these three lines is the whole
    // migration path back to React if that ever becomes worth 47 KB.
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: '速記卡',
        short_name: '速記卡',
        description: '把 Google Sheet 變成速記卡。不需要帳號，不保存你的任何資料。',
        lang: 'zh-Hant',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3f6f8f',
        icons: [
          // Rounded, shown as-is.
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Square and full-bleed: Android applies its own mask, so this one
          // must not be pre-rounded or it gets rounded twice and clipped.
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,csv}'],
        runtimeCaching: [
          {
            // The deck itself. Serve the cached copy instantly, refresh behind
            // it. gviz sends CORS headers, so the response is readable rather
            // than opaque, which is what makes this cache usable at all.
            urlPattern: /^https:\/\/docs\.google\.com\/spreadsheets\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'deck-source',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              // Tells the page when the background refresh found different
              // content, so it can say so instead of swapping cards out from
              // under someone mid-round.
              broadcastUpdate: {
                channelName: 'deck-source-updated',
                options: { headersToCheck: ['content-length', 'etag', 'last-modified'] },
              },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022' },
})
