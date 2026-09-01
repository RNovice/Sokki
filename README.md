# 速記卡 / Sokki

A flashcard drill that reads a Google Sheet and keeps nothing about you.

No account, no server, no database. A deck is a public Google Sheet; the URL is
the entire state. Nothing you do in the app is stored anywhere we control —
which is also why there is no spaced repetition, no streak, and no history.
It is a drill tool, not a scheduler, and the interface says so.

## How a deck works

Column A is the front, column B is the back, and there is **no header row** —
row 1 is the first card. Extra columns are ignored. In Google Sheets, set
Share → Anyone with the link → Viewer.

That makes the sheet readable by anyone holding the link, so keep private notes
out of it. There is no private path — every deck is a URL, which is what makes
every deck shareable.

## Running it

```
npm install
npm run dev        # http://localhost:5173
npm test           # pure-function tests + the theme contrast gate
npm run build      # typecheck, bundle, seal the CSP, enforce the budget
```

`npm run build` fails if initial JS exceeds **60 KB gzipped**. That ceiling is
about 1.5× what the app actually needs, so it only fires when something
unjustified arrives — which it has already done three times, for React (47 KB),
i18next (40 KB) and gtag.js (146 KB).

## Deploying

Cloudflare Workers, not Pages. Pages is in maintenance mode and Cloudflare
directs new projects to Workers, whose static assets read the same `_headers`
file, so nothing here had to change to follow them.

`wrangler.jsonc` holds the whole configuration: a name, a compatibility date,
and `dist` as the asset directory. There is no Worker script — every response
is a file. In the dashboard, connect the repository and set:

| Field | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

No SPA-fallback rule to configure. Routing is by query parameter, so `/?d=jp-n5`
is the same `index.html` as `/`, and a request for a path this site does not
have should say so rather than answer with the app.

`public/_headers` carries the cache policy and a Content-Security-Policy whose
script hash is computed at build time by `scripts/seal-csp.mjs` — editing the
inline theme script cannot leave the policy stale.

Set `VITE_SITE_ORIGIN` in the build environment to the deployed origin. It makes
`og:url` and `og:image` absolute; a link preview with a relative image is at the
mercy of whether a given crawler resolves it.

`npm run og` reads the link preview from a running build and checks what the
crawlers silently drop a preview over — a missing image, a relative URL, wrong
dimensions. The public validators fetch from their own servers and cannot see
localhost, so reach for `cloudflared tunnel --url http://localhost:4173` when you
want to see the card itself rather than its parts.

Turn on Web Analytics in the dashboard for traffic and Core Web Vitals. It sets
no cookie and no identifier, so it needs no consent banner and does not
contradict the promise above. The CSP already allows its beacon.

## Shape of the code

```
src/core/     csv, deck references and loading, the round, storage, preferences
src/i18n/     ~70 strings per locale, loaded on demand
src/theme/    twelve tokens, ten palettes, all gated on WCAG AA
src/monitoring/  web-vitals, deduplicated errors, over-threshold timings
src/ui/       the screens
```

Written as React, shipped as Preact: `vite.config.ts` aliases `react` and
`react-dom` to `preact/compat`. Deleting those three lines is the whole
migration path back to React, should 47 KB ever be worth it.

## What this deliberately does not do

Spaced repetition. Persisted progress. Writing to your spreadsheet. OAuth.
CSV upload. Audio or images. Per-deck app icons. User-defined theme colours.
Each was considered and rejected for a stated reason — see
[DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md), which also records where the build
since diverged from the plan and why.
