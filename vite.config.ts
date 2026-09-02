import { defineConfig, loadEnv } from 'vite'
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
  // The unprefixed members below are English, so these are the other two.
  name_localized: { 'zh-Hant': zhHant['app.name'], ja: ja['app.name'] },
  short_name_localized: { 'zh-Hant': zhHant['app.name'], ja: ja['app.name'] },
  description_localized: { 'zh-Hant': zhHant['app.tagline'], ja: ja['app.tagline'] },
}

/* -------------------------------------------------------------- static shell */

/** Text from a locale file can contain markup characters; treat it as data. */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  )
}

/**
 * The landing page, as markup, inside index.html.
 *
 * Two things were wrong with an empty `<div id="app">`. A crawler that does not
 * run JavaScript saw zero words — the served HTML had no visible text at all.
 * And the real users' LCP element, per Cloudflare's field data, was
 * `#app > div.page > div.row-list > button`: the largest thing on the page did
 * not exist until the bundle had downloaded, parsed and rendered, which is why
 * LCP sat at 1.1 s at the 75th percentile. This paints it when the stylesheet
 * lands instead.
 *
 * The strings come from the locale module rather than being written out here,
 * so the wording cannot drift from the app's. The *structure* still can: it
 * mirrors ui/Landing and ui/TopBar by hand, and if those change shape without
 * this following, the first paint and the first render disagree and the page
 * shifts. That is the maintenance cost, and it is the reason the shell stops at
 * the landing page and is not attempted for any other screen.
 *
 * It is English because that is the default locale and the one bundled, so it
 * is also what the app itself renders for the moment before a reader's own
 * language arrives — the shell and the first render agree. It is the right
 * choice for the crawler too: one page gets indexed, and English reaches the
 * most of the three audiences this app is built for.
 */
function landingShell(): string {
  const dict = en as Record<string, string | undefined>
  const s = (key: string) => escapeHtml(dict[key] ?? key)
  const chevron =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'class="deck-arrow"><path d="M9 5l7 7-7 7"/></svg>'
  const row = (name: string, sub: string) =>
    `<button class="row-link"><span class="grow"><span class="name">${s(name)}</span><br>` +
    `<span class="sub">${s(sub)}</span></span>${chevron}</button>`

  return (
    `<header class="topbar"><h1 class="grow">${s('app.name')}</h1>` +
    `<button class="quiet icon-only" aria-label="${s('common.settings')}"></button></header>` +
    '<div class="page">' +
    `<p class="muted">${s('app.tagline')}</p>` +
    '<div class="panel"><label>' +
    `<span class="label-text">${s('landing.pasteLabel')}</span>` +
    `<input type="url" inputmode="url" autocomplete="off" spellcheck="false" ` +
    `placeholder="${s('landing.pastePlaceholder')}"></label>` +
    `<div class="row"><button class="primary" disabled>${s('landing.load')}</button></div></div>` +
    '<div class="row-list">' +
    row('landing.examples', 'landing.examplesSub') +
    row('landing.howtoTitle', 'landing.howtoSub') +
    '</div></div>'
  )
}

/**
 * Open Graph wants absolute URLs, and a static build does not know where it
 * will be served from. VITE_SITE_ORIGIN supplies it; without one the URLs are
 * left relative, which most crawlers resolve anyway but none promise to.
 */
let envOrigin = ''
let envBeaconToken = ''

/**
 * Cloudflare Web Analytics, installed by hand rather than at the edge.
 *
 * Automatic injection is a zone-level rewrite: it lands on every hostname under
 * `example.com`, so a project on a subdomain has its numbers mixed into the
 * parent's and can only be separated by filtering a shared dashboard. And
 * Web Analytics will not offer automatic setup for a subdomain at all — a
 * "site" there means a zone, and a subdomain is a record inside one.
 *
 * So the beacon goes in the page. It then reports only where this build is
 * served, which is the isolation wanted, and it is in version control rather
 * than being invisibly appended by the proxy.
 *
 * The token is not a secret — it ships in the HTML of every page it measures.
 * It lives in .env.production for the same reason the origin does, and being a
 * variable means a fork of this repository does not report into someone else's
 * dashboard.
 */
function beaconToken() {
  return envBeaconToken.trim()
}

function siteOrigin() {
  const origin = envOrigin.replace(/\/$/, '')
  if (!origin) {
    console.warn(
      '\n  VITE_SITE_ORIGIN is not set.' +
        '\n  og:url stays relative, and the canonical link and sitemap.xml are' +
        '\n  left out entirely — both have to be absolute to mean anything.\n',
    )
  }
  return origin
}

export default defineConfig(({ mode }) => {
  /*
   * Read through loadEnv rather than process.env. A `.env` file is picked up by
   * Vite for the *app*, not for this config, so a committed VITE_SITE_ORIGIN
   * would be invisible here and every build would warn and skip the canonical.
   * The origin is not a secret, so it lives in .env.production and needs no
   * dashboard setting to be correct.
   */
  const env = loadEnv(mode, process.cwd(), '')
  envOrigin = env.VITE_SITE_ORIGIN ?? ''
  envBeaconToken = env.VITE_CF_BEACON_TOKEN ?? ''

  return {
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
        handler: (html) => ({
          html: html
            .replaceAll('%SITE_ORIGIN%', siteOrigin())
            .replace('<div id="app"></div>', `<div id="app">${landingShell()}</div>`),
          /*
           * Injected rather than written into index.html, because Vite runs
           * every `<link href>` through its asset pipeline and a build-time
           * placeholder resolves to a directory.
           *
           * Only when an origin is configured. A canonical has to be absolute
           * to mean anything, and `/` would be resolved as an asset and fail
           * the build. It points at the root from every URL on the site, which
           * is the point: `?s=<sheet>` is not a page of ours to publish, and
           * there is an unbounded number of them.
           */
          tags: [
            ...(siteOrigin()
              ? [
                  {
                    tag: 'link',
                    attrs: { rel: 'canonical', href: `${siteOrigin()}/` },
                    injectTo: 'head' as const,
                  },
                ]
              : []),
            /*
             * Omitted entirely without a token, rather than shipped pointing at
             * nothing: an analytics script that cannot report is bytes and a
             * connection spent for no reason, and every local build would make
             * one.
             *
             * It carries `src`, which matters twice over: scripts/seal-csp.mjs
             * and src/shell.test.ts both count *inline* scripts, and both skip
             * anything with a src, so this cannot disturb the CSP hash. The
             * policy in public/_headers already allows both of the hosts it
             * needs.
             */
            ...(beaconToken()
              ? [
                  {
                    tag: 'script',
                    attrs: {
                      defer: true,
                      src: 'https://static.cloudflareinsights.com/beacon.min.js',
                      'data-cf-beacon': JSON.stringify({ token: beaconToken() }),
                    },
                    injectTo: 'body' as const,
                  },
                ]
              : []),
          ],
        }),
      },
    },
    /*
     * robots.txt and sitemap.xml are emitted rather than kept in public/,
     * because both need the origin and files in public/ are copied verbatim.
     */
    {
      name: 'seo-files',
      apply: 'build' as const,
      generateBundle() {
        const origin = siteOrigin()
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          // Nothing is disallowed. Blocking `?s=` would stop a crawler reading
          // the canonical that tells it those are not pages, which is worse
          // than letting it read one and move on.
          source: `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`,
        })
        // A sitemap entry has to be an absolute URL, so without an origin there
        // is nothing valid to write and the file is left out entirely.
        if (!origin) return
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `  <url><loc>${origin}/</loc></url>\n` +
            '</urlset>\n',
        })
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
        name: en['app.name'],
        short_name: en['app.name'],
        description: en['app.tagline'],
        lang: 'en',
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
  }
})
