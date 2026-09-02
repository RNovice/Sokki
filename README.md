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

A deck can be named on its own screen, and the name travels in the share link
as `&t=`. Card text can be read as a small Markdown subset — `**bold**`,
`*italic*`, `` `code` ``, `~~strike~~`, headings, `>` quotes, `-` lists and
`---` — which is off by default and carried in the link as `&md=1`, because the
person who wrote the sheet is the one who knows whether it is Markdown. The
parser returns a data structure and never an HTML string, so injection has no
path rather than a filter to get past.

The last twenty sheets you opened are listed on the landing page. That exists
because the URL being the whole state means closing the tab otherwise loses the
deck; it holds a spreadsheet id, a tab, a name and a timestamp, never card text,
and one control in settings clears it.

## Running it

```
npm install
npm run dev        # http://localhost:5173
npm run check      # lint, typecheck, test — everything that can fail
npm run build      # check, then bundle, seal the CSP, enforce the budget
```

`npm run build` runs `npm run check` first, so a build cannot ship with a
failing test or a lint error. That was not always true: the tests used to sit
outside the gate, which meant every one of them could be red and the deploy
would still succeed.

It then fails if initial JS exceeds **60 KB gzipped**. That ceiling is about 3×
what the app actually needs, so it only fires when something unjustified arrives
— which it has already done four times, for React (47 KB), i18next (40 KB),
gtag.js (146 KB) and Prism (17 KB, for Markdown syntax highlighting).

Linting is **oxlint**, not typescript-eslint, and not by preference: this repo
is on TypeScript 7, whose package ships the Go compiler and no JavaScript
compiler API, so typescript-eslint has nothing to bind to. `oxlint-tsgolint`
does bind to it, which is how the type-aware rules — `no-floating-promises` and
friends — still run. `.oxlintrc.json` says why each disabled rule is disabled;
several of them are simply wrong for Preact or for refs.

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

`VITE_SITE_ORIGIN` lives in `.env.production`, committed, because an origin is
public by definition — it is the address people type. Without it the build warns
and then silently drops the canonical link and `sitemap.xml`, since both have to
be absolute to mean anything, and `og:url` stays relative.

`robots.txt` and `sitemap.xml` are emitted by the build rather than kept in
`public/`, because both need that origin and files in `public/` are copied
verbatim. Nothing is disallowed: blocking `?s=` would stop a crawler reading the
canonical that tells it those are not pages, which is worse than letting it read
one and move on.

There is deliberately no preview image. One identical for every deck carries
nothing, and a large one takes the card over and pushes the description — the
part that says something — out of view. `twitter:card` is `summary` to match.

`npm run og` reads the link preview from a running build and checks what the
crawlers silently drop a preview over — a relative URL, wrong dimensions, or a
card type promising an image the page does not have. The public validators fetch from their own servers and cannot see
localhost, so reach for `cloudflared tunnel --url http://localhost:4173` when you
want to see the card itself rather than its parts.

Web Analytics gives traffic and Core Web Vitals. It sets no cookie and no
identifier, so it needs no consent banner and does not contradict the promise
above, and the CSP already allows its beacon.

Its snippet is installed in the page, from `VITE_CF_BEACON_TOKEN`, rather than
injected at the edge. Automatic injection is zone-level: it lands on every
hostname under the domain, so a project on a subdomain has its numbers mixed
into the parent's and can only be separated by filtering a shared dashboard.
Web Analytics also declines to offer automatic setup for a subdomain — a "site"
there means a zone, and a subdomain is a record inside one, so it answers "this
hostname does not belong to any site in your account" and hands you the
snippet. That is the isolated route, not a problem to route around.

With no token no beacon is emitted at all, which is what a local build wants.
The token is not a secret — it ships in the HTML of every page it measures —
but it is a variable so that a fork does not report into someone else's
dashboard. Set it in **Settings → Build → Build Variables and Secrets**, which
is not the same page as *Settings → Variables and Secrets*: the latter binds
values to a Worker at runtime, there is no Worker script here, and the token has
to be in the HTML before it is served. Set in the wrong one, the build succeeds
and no beacon appears.

After deploying, count them — and count them like this, because the two obvious
shortcuts both lie:

```
curl -s -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) \
  AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' \
  https://<host>/ | grep -o 'cloudflareinsights' | wc -l
```

`grep -c` counts matching *lines*, and the built HTML is on few enough lines
that two beacon tags register as one. And the edge only injects for requests
that look like a browser: a plain `curl` sees one tag and passes, while a real
visitor gets two.

Two is what this returns today, and the documentation's "only one JS snippet is
used per page" does not mean the edge skips the one already there — both load,
both report. So a subdomain measured this way is counted twice until the zone's
*Web Analytics → Manage Site → Advanced Options → JS Snippet injection* is
turned off, which costs the parent domain its automatic collection and means
installing the snippet there too.

It is the **only** source for LCP, INP and CLS. The app carries no vitals code
of its own: the `web-vitals` package was downloading 3 KB gzipped to feed a
function that discarded every value, because reporting needs an endpoint and
there is none. Two sources for one number is one too many, and that was the one
costing bytes.

## Shape of the code

```
src/core/     csv, deck references and loading, the round, storage, preferences
src/i18n/     ~100 strings per locale; English is bundled, the other two load
src/theme/    fourteen tokens, ten palettes, eleven pairings gated on WCAG AA
src/monitoring/  deduplicated errors and over-threshold timings, nothing else
src/dev/      render counting, for development only — see below
src/ui/       the screens
```

Written as React, shipped as Preact: `vite.config.ts` aliases `react` and
`react-dom` to `preact/compat`. Deleting those three lines is the whole
migration path back to React, should 47 KB ever be worth it.

### The landing page exists twice

`index.html` ships a static copy of the landing page inside `#app`, built by
`landingShell()` in `vite.config.ts`. Two things were wrong without it: a
crawler that does not run JavaScript saw no words at all, and the real users'
largest-contentful element was a button inside `#app`, so nothing painted until
the bundle had downloaded, parsed and rendered.

Its strings come from the locale module, so the wording cannot drift. **The
structure can.** It mirrors `ui/Landing` and `ui/TopBar` by hand, and if either
changes shape without this following, the first paint and the first render
disagree and the page shifts. That is the cost of it, and the reason it stops at
the landing page and is not attempted for any other screen. `src/shell.test.ts`
catches what it can — the title, the language, the number of inline scripts.

`main.tsx` empties `#app` before rendering rather than hydrating: hydration
needs the markup to match what the component would produce, and it cannot,
because the shell is one language and the reader may want another.

### Counting renders

There is no React DevTools here, and `react-scan` does not work — it reads
React's fiber tree and only uses Preact to build its own interface. Preact's own
devtools extension is the equivalent. `src/dev/render-audit.ts` is neither, and
needs no extension, so it runs on a real phone over the network:

```js
__renders.reset()      // before the interaction you want to measure
__renders.report()     // a table, busiest component first
__renders.parents()    // Child <- Parent, to find who is pushing a render
__renders.highlight()  // draw a box round whatever just re-rendered
```

It works by assigning to the private hooks Preact exposes on its `options`
object — the same ones the devtools bridge uses. The catch is that the published
build is minified, so `options._render` is `options.__r` in anything shipped and
both names have to be wired up.

It is loaded from a dynamic import behind `import.meta.env.DEV`, so Vite drops
the file out of a production build; `npm run budget` is how you check that the
initial JS figure has not moved. Two things to know about what it shows: it
boxes mounts as well as re-renders, and the boxes cost a synchronous layout
each, so read counts from it and measure durations with it off.

## What this deliberately does not do

Spaced repetition. Persisted progress. Writing to your spreadsheet. OAuth.
CSV upload. Audio or images. Per-deck app icons. User-defined theme colours.
Each was considered and rejected for a stated reason — see
[DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md), which also records where the build
since diverged from the plan and why.
