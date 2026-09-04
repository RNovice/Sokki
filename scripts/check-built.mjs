/**
 * What the build produced, checked against the files that are about to ship.
 *
 * These facts used to be assertions in src/shell.test.ts and
 * src/manifest.test.ts, reading dist/. They could not work there. `npm run check` runs before
 * `vite build`, so on a fresh clone there was no dist and the whole block
 * skipped in silence, and on every build after that it passed or failed on the
 * *previous* artifact — which is how a change to the head could ship green and
 * then fail the next build for no visible reason.
 *
 * A guard that cannot fire is worse than no guard, because it reads as
 * coverage. So they run here instead, after vite build and after seal-csp, on
 * the bytes that are about to be deployed.
 *
 * src/manifest.test.ts said so itself — "skipped otherwise, because a test
 * that fails on a clean checkout teaches people to ignore failures" — which is
 * the right instinct and the wrong conclusion. The answer is not to skip the
 * check, it is to run it where the file exists.
 *
 * The source-side facts stayed in shell.test.ts, where they belong: those are
 * about index.html as written, and a test is the right place for them.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
/*
 * Imported, not parsed: Node reads TypeScript directly, so the wording comes
 * from the same module the interface uses and cannot drift from it — the same
 * reason vite.config.ts imports the locale files to build the shell.
 */
import en from '../src/i18n/en.ts'
import ja from '../src/i18n/ja.ts'
import zhHant from '../src/i18n/zh-Hant.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(join(ROOT, 'dist', 'manifest.webmanifest'), 'utf8'))

const failures = []
const passes = []

function check(name, ok, detail) {
  if (ok) passes.push(name)
  else failures.push(detail ? `${name}\n      ${detail}` : name)
}

/*
 * An empty #app means a crawler sees no words at all, and the first paint waits
 * for the bundle. Cloudflare's field data named the largest element on the page
 * as a button inside it, so this is the LCP element as well as the copy.
 */
/*
 * Looked for inside #app, not anywhere in the file. The tagline is also in the
 * meta description and the JSON-LD, both in <head>, so searching the whole
 * document let those stand in for a shell that had stopped being injected —
 * another check that could not fail. Slicing from #app onwards leaves the head
 * behind entirely.
 */
const app = html.slice(html.indexOf('<div id="app">'))
check(
  'the static landing shell is there, in the language the app starts in',
  [en['app.tagline'], en['landing.pasteLabel'], en['landing.examples']].every((s) =>
    app.includes(s),
  ),
)

/*
 * main.tsx empties #app before rendering, so the shell only has to look right —
 * but it has to be *inside* #app for that emptying to reach it. Left outside,
 * it would survive the render and sit behind the live interface forever.
 *
 * Anchored to the opening tag rather than searched for between #app and
 * </body>, which is what this did when it was a test: that passed just as
 * happily with the shell in a sibling of #app, and a check that cannot fail is
 * the thing this file exists to stop.
 */
check(
  'the shell sits inside the element the app renders into',
  /<div id="app">\s*<header class="topbar"/.test(html),
)

/*
 * The beacon is only emitted when a token is configured, so this asserts a
 * conditional: if it is there, it carries a src. seal-csp.mjs counts *inline*
 * scripts to find the one it hashes, and a beacon without a src would push that
 * count to two and take the CSP hash with it.
 */
/*
 * Found by `data-cf-beacon`, not by the host name. The host only appears in the
 * src, so keying on it made this unfalsifiable: removing the src removed the
 * thing being matched, no tag was found, and the check reported success.
 */
const beacon = /<script([^>]*\bdata-cf-beacon\b[^>]*)>/.exec(html)
check(
  'the analytics beacon stays out of the inline-script count',
  !beacon || /\bsrc=/.test(beacon[1]),
  beacon ? `found without a src: ${beacon[0]}` : undefined,
)

/*
 * Nothing in <head> may stop the parser reaching the shell.
 *
 * The shell exists so the landing page paints without waiting for the bundle. A
 * classic `<script src>` in the head undoes that on its own: the parser halts
 * there, a round trip ahead of the markup it was going to paint. registerSW.js
 * was doing exactly that by default, and it is a `load` listener, so it had
 * nothing to halt for.
 *
 * Every way this comes back is a quiet one: a plugin's default, a snippet
 * pasted into the head, a defer dropped in a refactor.
 */
const head = html.slice(0, html.indexOf('</head>'))
const blocking = [...head.matchAll(/<script[^>]*\bsrc=[^>]*>/g)]
  .map(([tag]) => tag)
  .filter((tag) => !/\bdefer\b|\basync\b|type="module"/.test(tag))
check(
  'nothing in the head stops the parser reaching the shell',
  blocking.length === 0,
  blocking.join('\n      '),
)

/* ------------------------------------------------------- the web manifest */

/*
 * Two copies of the app's own name would drift, and the one on the home screen
 * is the copy nobody thinks to check.
 */
check(
  'the installed name says what the interface says, in every language',
  manifest.name === en['app.name'] &&
    manifest.description === en['app.tagline'] &&
    JSON.stringify(manifest.name_localized) ===
      JSON.stringify({ 'zh-Hant': zhHant['app.name'], ja: ja['app.name'] }) &&
    JSON.stringify(manifest.description_localized) ===
      JSON.stringify({ 'zh-Hant': zhHant['app.tagline'], ja: ja['app.tagline'] }),
)

/*
 * Without `lang`, a browser cannot tell what the fallback is written in. It is
 * English because English is the app's default and the locale bundled with it;
 * the other two are the localized members above.
 */
check('the manifest declares what language its unlocalized values are in', manifest.lang === 'en')

/*
 * The identity, which must never move.
 *
 * `id` is resolved against the origin and is what tells a browser one app from
 * another. It is `/` because the manifest sits at the root, so `start_url: '.'`
 * resolves to the same URL — which is what identity was before `id` existed
 * here, and therefore what keeps every existing install intact.
 *
 * Changing it does not break a build or show up in a diff review as anything
 * alarming. It silently gives everyone who installed the app a second icon and
 * an empty copy of it, because the storage is keyed on identity too.
 */
check('the installed app keeps the identity it was installed under', manifest.id === '/')

check(
  'every locale the unprefixed values do not cover is localized',
  JSON.stringify(Object.keys(manifest.name_localized).sort()) ===
    JSON.stringify(['ja', 'zh-Hant']),
)

console.log('\nBuilt output\n')
for (const name of passes) console.log(`  ✓ ${name}`)
for (const detail of failures) console.error(`  ✗ ${detail}`)

if (failures.length) {
  console.error(`\n  ${failures.length} of ${passes.length + failures.length} checks failed.\n`)
  process.exit(1)
}
console.log()
