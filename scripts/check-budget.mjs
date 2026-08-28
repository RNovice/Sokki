/**
 * The performance budget, enforced.
 *
 * The number that actually matters is LCP and INP, but those need a real
 * device and a real network, so they cannot gate a build. Bytes are the cheap
 * proxy that can: a ceiling here is what stops a 47 KB framework or a 40 KB
 * i18n library from arriving unnoticed.
 *
 * Counts only what the entry HTML pulls in eagerly. Lazily imported locale
 * chunks are reported but not charged, because a reader of one language never
 * downloads the other two.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const LIMIT_BYTES = 60 * 1024

function gzipped(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const eager = new Set(
  [...html.matchAll(/(?:src|href)="[^"]*?\/assets\/([^"]+\.js)"/g)].map((m) => m[1]),
)

const assets = join(DIST, 'assets')
const files = readdirSync(assets).filter((f) => f.endsWith('.js'))

let total = 0
const rows = []
for (const file of files) {
  const size = gzipped(join(assets, file))
  const charged = eager.has(file)
  if (charged) total += size
  rows.push({ file, size, charged, raw: statSync(join(assets, file)).size })
}
rows.sort((a, b) => b.size - a.size)

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
console.log('\nJS budget (gzip)\n')
for (const r of rows) {
  console.log(
    `  ${r.charged ? '●' : '○'} ${r.file.padEnd(34)} ${kb(r.size).padStart(9)}  (raw ${kb(r.raw)})`,
  )
}
console.log(`\n  ● counted toward the budget   ○ loaded on demand`)
console.log(`\n  initial JS: ${kb(total)} / ${kb(LIMIT_BYTES)}`)

if (total > LIMIT_BYTES) {
  console.error(`\n  OVER BUDGET by ${kb(total - LIMIT_BYTES)}.`)
  console.error('  Either remove the dependency that caused it, or change the budget on purpose.\n')
  process.exit(1)
}
console.log(`  ${kb(LIMIT_BYTES - total)} of headroom.\n`)
