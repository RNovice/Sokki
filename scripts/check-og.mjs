/**
 * Inspect the link preview without deploying.
 *
 * The public validators — Facebook's debugger, LINE's, Slack's unfurler — all
 * fetch the page from their own servers, so none of them can see localhost.
 * This reads the same tags they would and checks the things they silently drop
 * a preview over: a missing image, a relative URL, wrong dimensions.
 *
 *   npm run preview            # in one shell
 *   npm run og                 # in another
 *   npm run og -- https://…    # or against a deployed URL
 */

const target = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '')

/* --------------------------------------------------------------- fetching */

let html
try {
  const response = await fetch(target + '/')
  if (!response.ok) {
    console.error(`\n  ${target} answered ${response.status}.\n`)
    process.exit(1)
  }
  html = await response.text()
} catch {
  console.error(
    `\n  Could not reach ${target}.` +
      '\n  Start one with `npm run preview`, or pass a URL as an argument.\n',
  )
  process.exit(1)
}

/* ---------------------------------------------------------------- parsing */

/**
 * Attribute order varies, so match on the tag and pull both fields out. Values
 * are collected into arrays because og:locale:alternate is legitimately
 * repeated, and keeping only the last one would report the others as missing.
 */
function metaTags(html) {
  const found = new Map()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1]
    const value = /content=["']([\s\S]*?)["']/i.exec(tag)?.[1]
    if (key && value !== undefined) found.set(key, [...(found.get(key) ?? []), value])
  }
  return found
}

const tags = metaTags(html)
/** First value for the single-valued members, which is all the checks need. */
const meta = new Map([...tags].map(([key, values]) => [key, values[0]]))
const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''

/* ------------------------------------------------------------- png header */

/** Dimensions straight from IHDR; no decode needed for width and height. */
function pngSize(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47]
  if (!signature.every((b, i) => buffer[i] === b)) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/* ----------------------------------------------------------------- report */

const problems = []
const notes = []

const required = ['og:title', 'og:description', 'og:image', 'og:type', 'og:url']
for (const key of required) {
  if (!meta.has(key)) problems.push(`${key} is missing`)
}

const imageUrl = meta.get('og:image')
let image = null
if (imageUrl) {
  if (!/^https?:\/\//i.test(imageUrl)) {
    problems.push(
      `og:image is relative (${imageUrl}). Most crawlers resolve it, none promise to — ` +
        'set VITE_SITE_ORIGIN at build time.',
    )
  }
  const absolute = /^https?:\/\//i.test(imageUrl) ? imageUrl : target + imageUrl
  const path = absolute.replace(/^https?:\/\/[^/]+/i, '')

  /**
   * Try the URL the crawler would use, then the same path on whatever is being
   * checked. Building with a configured origin and previewing on localhost is
   * the normal case, and it should still be able to measure the image rather
   * than reporting a failure that only means "that domain is not live yet".
   */
  const attempts = absolute.startsWith(target) ? [absolute] : [absolute, target + path]
  let fetched = null
  for (const url of attempts) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      fetched = { url, buffer: Buffer.from(await response.arrayBuffer()) }
      break
    } catch {
      /* try the next one */
    }
  }

  if (!fetched) {
    problems.push(`og:image could not be fetched from ${attempts.join(' or ')}`)
  } else {
    if (fetched.url !== absolute) {
      notes.push(
        `og:image points at ${absolute}, which is not reachable from here; ` +
          `measured ${fetched.url} instead. Confirm it once the site is deployed.`,
      )
    }
    image = { bytes: fetched.buffer.length, ...(pngSize(fetched.buffer) ?? {}) }
    if (!image.width) problems.push('og:image is not a PNG this script can read')
    else if (image.width < 600 || image.height < 315)
      problems.push(`og:image is ${image.width}x${image.height}; 1200x630 is the usual target`)
    // Several platforms refuse to fetch images past a few megabytes.
    if (fetched.buffer.length > 5_000_000) problems.push('og:image is over 5 MB')
  }
}

const description = meta.get('og:description') ?? ''
if (description.includes('\n')) {
  notes.push('og:description contains newlines; most clients collapse them into one line.')
}
if (description.length > 200) {
  notes.push(`og:description is ${description.length} characters; most clients cut around 160.`)
}
if (!meta.has('twitter:card')) {
  notes.push('twitter:card is absent; X and some others fall back to a small preview.')
}

/* ------------------------------------------------------------------ print */

const line = '─'.repeat(64)
console.log(`\n  ${target}\n`)
console.log(`  ${line}`)
console.log(`  ${title || '(no <title>)'}`)
console.log(`  ${line}`)
for (const [key, values] of tags) {
  if (!/^(og:|twitter:|description$)/.test(key)) continue
  for (const value of values) {
    const shown = value.replace(/\n/g, '\n' + ' '.repeat(28))
    console.log(`  ${key.padEnd(24)} ${shown}`)
  }
}
if (image?.width) {
  console.log(`  ${'(image)'.padEnd(24)} ${image.width}x${image.height}, ${(image.bytes / 1024).toFixed(1)} KB`)
}

if (notes.length) {
  console.log('\n  Worth knowing')
  for (const note of notes) console.log(`    - ${note}`)
}

if (problems.length) {
  console.log('\n  Problems')
  for (const problem of problems) console.log(`    - ${problem}`)
  console.log('')
  process.exit(1)
}

console.log('\n  No problems found.')
console.log(
  '  The real validators fetch from their own servers and cannot see localhost;' +
    '\n  expose it with `cloudflared tunnel --url http://localhost:4173` to use them.\n',
)
