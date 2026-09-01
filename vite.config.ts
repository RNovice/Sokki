import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
// Read from the same place the interface reads them, so the installed app's
// name cannot drift from the one inside it.
import en from './src/i18n/en'
import ja from './src/i18n/ja'
import zhHant from './src/i18n/zh-Hant'

/**
 * The `*_localized` manifest members are newer than vite-plugin-pwa's types, so
 * they are spread in rather than written inline — a spread skips the excess
 * property check, where casting the whole manifest would hide real mistakes in
 * the fields the types do know about.
 */
const localizedManifest: Record<string, unknown> = {
  name_localized: { en: en['app.name'], ja: ja['app.name'] },
  short_name_localized: { en: en['app.name'], ja: ja['app.name'] },
  description_localized: { en: en['app.tagline'], ja: ja['app.tagline'] },
}

/**
 * Open Graph wants absolute URLs, and a static build does not know where it
 * will be served from. VITE_SITE_ORIGIN supplies it; without one the URLs are
 * left relative, which most crawlers resolve anyway but none promise to.
 */
function siteOrigin() {
  const origin = (process.env.VITE_SITE_ORIGIN ?? '').replace(/\/$/, '')
  if (!origin) {
    console.warn(
      '\n  VITE_SITE_ORIGIN is not set: og:image and og:url will be relative.' +
        '\n  Link previews are more reliable with an absolute URL.\n',
    )
  }
  return origin
}

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
    {
      name: 'site-origin',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replaceAll('%SITE_ORIGIN%', siteOrigin()),
      },
    },
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        /*
         * `lang` names what the unprefixed values are written in; the localized
         * variants carry the rest. A browser without support falls back to the
         * unprefixed value by itself, so this is additive — nothing to feature
         * detect and nothing to break. Chrome and Edge read it from 148.
         */
        ...localizedManifest,
        name: zhHant['app.name'],
        short_name: zhHant['app.name'],
        description: zhHant['app.tagline'],
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
