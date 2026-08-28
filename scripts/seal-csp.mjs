/**
 * Replaces the placeholder in dist/_headers with the real hash of the inline
 * script in dist/index.html.
 *
 * The theme script must be inline: it runs before the first paint so the page
 * never flashes the wrong theme, and an external file would need a round trip
 * to do the same job. Inlining normally forces 'unsafe-inline' into script-src,
 * which switches off most of what a CSP is for. Hashing it keeps both.
 *
 * Because the hash is derived here rather than pasted in, editing the script
 * can never silently leave the policy pointing at the old one.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const html = readFileSync(join(DIST, 'index.html'), 'utf8')

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
)

if (inline.length !== 1) {
  console.error(
    `\n  Expected exactly one inline script in index.html, found ${inline.length}.`,
  )
  console.error('  Each one needs its own hash in the CSP, so this must be handled on purpose.\n')
  process.exit(1)
}

const hash = 'sha256-' + createHash('sha256').update(inline[0], 'utf8').digest('base64')

const headersPath = join(DIST, '_headers')
const headers = readFileSync(headersPath, 'utf8')
if (!headers.includes('__INLINE_SCRIPT_HASH__')) {
  console.error('\n  _headers has no __INLINE_SCRIPT_HASH__ placeholder to fill.\n')
  process.exit(1)
}

writeFileSync(headersPath, headers.replaceAll('__INLINE_SCRIPT_HASH__', hash))
console.log(`\n  CSP sealed with ${hash}\n`)
