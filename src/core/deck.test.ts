import { describe, expect, it } from 'vitest'
import { deckKey, parseSheetInput, refFromParams, refToQuery, sourceUrl } from './deck'

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'

/**
 * The promise made to the user is that they never learn a URL format — they
 * paste whatever Google gave them and it works. Every shape below is something
 * a real person ends up with in their clipboard, so each one is a case here.
 */
describe('parseSheetInput', () => {
  it('takes the link from the Share dialog', () => {
    expect(parseSheetInput(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`))
      .toMatchObject({ kind: 'sheet', sheetId: ID, gid: '0' })
  })

  it('takes an editor URL and keeps the tab from the fragment', () => {
    expect(parseSheetInput(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=847362`))
      .toMatchObject({ kind: 'sheet', sheetId: ID, gid: '847362' })
  })

  it('takes a published-to-web URL', () => {
    const published = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTestTestTestTestTest/pubhtml'
    expect(parseSheetInput(published)).toMatchObject({ kind: 'sheet' })
  })

  it('takes a bare spreadsheet id', () => {
    expect(parseSheetInput(ID)).toMatchObject({ kind: 'sheet', sheetId: ID, gid: '0' })
  })

  it('takes a link this app produced, round-tripping through its own format', () => {
    const ours = `https://example.com/?s=${ID}&g=12&t=${encodeURIComponent('期中考範圍')}`
    expect(parseSheetInput(ours)).toMatchObject({
      kind: 'sheet',
      sheetId: ID,
      gid: '12',
      title: '期中考範圍',
    })
  })

  it('takes a link to a builtin deck', () => {
    expect(parseSheetInput('https://example.com/?d=toeic')).toEqual({
      kind: 'builtin',
      id: 'toeic',
    })
  })

  it('tolerates surrounding whitespace from a sloppy copy', () => {
    expect(parseSheetInput(`  https://docs.google.com/spreadsheets/d/${ID}/edit  `))
      .toMatchObject({ sheetId: ID })
  })

  it('returns null rather than throwing on things that are not sheets', () => {
    for (const junk of ['', '   ', 'hello', 'https://example.com', 'https://docs.google.com/document/d/abc']) {
      expect(parseSheetInput(junk)).toBeNull()
    }
  })

  it('rejects an id too short to be real, instead of guessing', () => {
    expect(parseSheetInput('abc123')).toBeNull()
  })
})

describe('refFromParams', () => {
  it('ignores a builtin id that does not exist', () => {
    expect(refFromParams(new URLSearchParams('d=no-such-deck'))).toBeNull()
  })

  it('falls back to tab 0 when gid is not a number', () => {
    expect(refFromParams(new URLSearchParams(`s=${ID}&g=notanumber`))).toMatchObject({ gid: '0' })
  })

  it('ignores unknown parameters, so older links keep working', () => {
    expect(refFromParams(new URLSearchParams(`s=${ID}&future=1`))).toMatchObject({ sheetId: ID })
  })
})

describe('refToQuery', () => {
  it('omits the default tab to keep the link short', () => {
    expect(refToQuery({ kind: 'sheet', sheetId: ID, gid: '0', title: undefined })).toBe(`?s=${ID}`)
  })

  it('round-trips a title containing characters that need encoding', () => {
    const ref = { kind: 'sheet', sheetId: ID, gid: '5', title: 'N5 & 旅行' } as const
    const parsed = refFromParams(new URLSearchParams(refToQuery(ref)!.slice(1)))
    expect(parsed).toMatchObject({ sheetId: ID, gid: '5', title: 'N5 & 旅行' })
  })

  it('gives every deck a link — there is no source without an address', () => {
    expect(refToQuery({ kind: 'builtin', id: 'toeic' })).toBe('?d=toeic')
    expect(refToQuery({ kind: 'sheet', sheetId: ID, gid: '3', title: undefined })).toContain(ID)
  })
})

describe('sourceUrl', () => {
  it('asks gviz for CSV on the requested tab', () => {
    const url = sourceUrl({ kind: 'sheet', sheetId: ID, gid: '99', title: undefined })
    expect(url).toContain(`/spreadsheets/d/${ID}/gviz/tq`)
    expect(url).toContain('tqx=out%3Acsv')
    expect(url).toContain('gid=99')
  })

  it('serves a builtin deck from the app’s own files', () => {
    expect(sourceUrl({ kind: 'builtin', id: 'toeic' }, '/')).toContain('/decks/')
  })
})

describe('deckKey', () => {
  it('separates two tabs of the same spreadsheet', () => {
    const a = deckKey({ kind: 'sheet', sheetId: ID, gid: '0', title: undefined })
    const b = deckKey({ kind: 'sheet', sheetId: ID, gid: '1', title: undefined })
    expect(a).not.toBe(b)
  })

  it('is unaffected by the title, so renaming does not orphan a saved round', () => {
    const a = deckKey({ kind: 'sheet', sheetId: ID, gid: '0', title: 'before' })
    const b = deckKey({ kind: 'sheet', sheetId: ID, gid: '0', title: 'after' })
    expect(a).toBe(b)
  })
})
