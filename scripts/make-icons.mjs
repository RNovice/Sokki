/**
 * Generates the app icons as raw PNG.
 *
 * Hand-written encoder rather than an image library: the artwork is three
 * rounded rectangles, and a build-only dependency for that is not worth
 * carrying. Output is RGBA, because the rounded icon needs its corners to be
 * genuinely transparent rather than filled with a guess at the page colour.
 *
 * Two variants, and the difference matters:
 *
 *   icon-*.png           rounded corners — the browser tab, the iOS home
 *                        screen, anywhere the file is shown as-is.
 *   icon-maskable-*.png  square, full bleed, artwork kept inside the safe
 *                        zone. Android applies its own mask to these, so
 *                        rounding them here would round them twice and clip
 *                        the result.
 *
 *   node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const GROUND = [0x2f, 0x6f, 0x6a]
const CARD_BACK = [0x9d, 0xc6, 0xc2]
const CARD_FRONT = [0xff, 0xff, 0xff]

/** Roughly the proportion iOS and Android use for an app tile. */
const CORNER_RADIUS = 0.22
/**
 * A maskable icon can be cropped to a circle covering the middle 80%, so the
 * artwork is scaled down to sit inside that and the ground runs to the edges.
 */
const SAFE_ZONE_SCALE = 0.8
/** Samples per axis. Nine per pixel is enough to hide the stair-stepping. */
const SUPERSAMPLE = 3

/* ------------------------------------------------------------------- png */

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** `pixels` is RGBA, four bytes per pixel. */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filter: none
    pixels.copy(raw, o, y * size * 4, (y + 1) * size * 4)
    o += size * 4
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------- geometry */

/** Rounded-rectangle hit test in unit coordinates. */
function inRoundedRect(x, y, r) {
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
  const cx = Math.min(Math.max(x, r.left + r.radius), r.right - r.radius)
  const cy = Math.min(Math.max(y, r.top + r.radius), r.bottom - r.radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r.radius * r.radius
}

/** Two offset cards. Reads as a stack at 192px and still at favicon size. */
const BACK_CARD = { left: 0.29, top: 0.21, right: 0.79, bottom: 0.67, radius: 0.05 }
const FRONT_CARD = { left: 0.21, top: 0.33, right: 0.71, bottom: 0.79, radius: 0.05 }

function scaleAbout(rect, factor) {
  const shift = (1 - factor) / 2
  return {
    left: rect.left * factor + shift,
    top: rect.top * factor + shift,
    right: rect.right * factor + shift,
    bottom: rect.bottom * factor + shift,
    radius: rect.radius * factor,
  }
}

/**
 * Colour at one sample point, or null where the icon is transparent. Alpha is
 * resolved by averaging samples in render(), so this only answers yes or no.
 */
function sample(x, y, { outline, back, front }) {
  if (outline && !inRoundedRect(x, y, outline)) return null
  if (inRoundedRect(x, y, front)) return CARD_FRONT
  if (inRoundedRect(x, y, back)) return CARD_BACK
  return GROUND
}

function render(size, { rounded }) {
  const scale = rounded ? 1 : SAFE_ZONE_SCALE
  const shape = {
    // A square icon has no outline to clip against; the ground runs to the edge.
    outline: rounded
      ? { left: 0, top: 0, right: 1, bottom: 1, radius: CORNER_RADIUS }
      : null,
    back: scaleAbout(BACK_CARD, scale),
    front: scaleAbout(FRONT_CARD, scale),
  }

  const pixels = Buffer.alloc(size * size * 4)
  const step = 1 / (size * SUPERSAMPLE)
  const half = step / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let covered = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = (x * SUPERSAMPLE + sx) * step + half
          const v = (y * SUPERSAMPLE + sy) * step + half
          const colour = sample(u, v, shape)
          if (!colour) continue
          r += colour[0]
          g += colour[1]
          b += colour[2]
          covered++
        }
      }

      const i = (y * size + x) * 4
      if (covered === 0) continue // stays fully transparent
      pixels[i] = Math.round(r / covered)
      pixels[i + 1] = Math.round(g / covered)
      pixels[i + 2] = Math.round(b / covered)
      pixels[i + 3] = Math.round((covered / (SUPERSAMPLE * SUPERSAMPLE)) * 255)
    }
  }

  return encodePng(size, pixels)
}

mkdirSync(OUT_DIR, { recursive: true })

for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, render(size, { rounded: true }))
  console.log(`wrote ${file}`)
}

const maskable = join(OUT_DIR, 'icon-maskable-512.png')
writeFileSync(maskable, render(512, { rounded: false }))
console.log(`wrote ${maskable}`)
