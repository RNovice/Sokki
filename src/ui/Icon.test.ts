import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guards the two properties the icon set exists for. Both are the kind of thing
 * that breaks silently: a hardcoded colour looks fine in the theme it was drawn
 * in and wrong in the other nine, and a pixel size looks fine at the default
 * type scale and wrong everywhere else.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('./Icon.tsx', import.meta.url)), 'utf8')

describe('icons', () => {
  it('draw with currentColor, so every theme is handled without extra work', () => {
    expect(SOURCE).toContain('stroke="currentColor"')
  })

  it('contain no literal colour anywhere', () => {
    // A hex value or an rgb() would pin an icon to one theme.
    const literals = SOURCE.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)
    expect(literals).toBeNull()
  })

  it('size in em, so an icon cannot fall out of step with its label', () => {
    // Only the <svg> element's own width/height are sizes. Numbers inside the
    // paths are coordinates on the 24-grid and are supposed to be absolute.
    const svgTag = /<svg\b[\s\S]*?>/.exec(SOURCE)?.[0] ?? ''
    expect(svgTag).toContain('width={`${size}em`}')
    expect(svgTag).toContain('height={`${size}em`}')
    expect(svgTag).not.toMatch(/(width|height)=["'][^"']*px/)
  })

  it('share one 24-grid and one stroke weight, so the set reads as a set', () => {
    expect(SOURCE).toContain('viewBox="0 0 24 24"')
    expect(SOURCE).toContain('stroke-width="2"')
    expect(SOURCE).toContain('fill="none"')
  })

  it('are hidden from screen readers, since each one sits next to a label', () => {
    expect(SOURCE).toContain('aria-hidden="true"')
  })

  it('needs no runtime dependency', () => {
    const imports = [...SOURCE.matchAll(/^import .*? from '([^']+)'/gm)].map((m) => m[1])
    expect(imports).toEqual(['preact'])
  })
})
