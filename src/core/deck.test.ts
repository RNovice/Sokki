import { describe, expect, it } from 'vitest'
import {
  deckKey,
  markdownFromInput,
  markdownFromParams,
  parseSheetInput,
  refFromParams,
  refToQuery,
  sourceUrl,
} from './deck'

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
const SITE = 'https://sokki.example'

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
    const ours = `${SITE}/?s=${ID}&g=12&t=${encodeURIComponent('期中考範圍')}`
    expect(parseSheetInput(ours, SITE)).toMatchObject({
      kind: 'sheet',
      sheetId: ID,
      gid: '12',
      title: '期中考範圍',
    })
  })

  it('takes a link to a builtin deck', () => {
    expect(parseSheetInput(`${SITE}/?d=toeic`, SITE)).toEqual({
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

/**
 * The paste box reads our own share links, and nothing says so — someone who
 * has one got it from a person, and pasting it where links go is what they will
 * try. What has to be true for that to be safe is that "one of ours" is checked
 * rather than assumed: `s` and `d` are names any site might use.
 */
describe('parseSheetInput, on links claiming to be ours', () => {
  it('reads the query only when the link came from this same origin', () => {
    const elsewhere = `https://not-sokki.example/?s=${ID}&g=12`
    expect(parseSheetInput(elsewhere, SITE)).toBeNull()
    expect(parseSheetInput(`${SITE}/?s=${ID}&g=12`, SITE)).toMatchObject({ sheetId: ID, gid: '12' })
  })

  it('is not fooled by an origin that merely starts or ends the same way', () => {
    for (const near of ['https://sokki.example.evil.test', 'https://evil-sokki.example']) {
      expect(parseSheetInput(`${near}/?d=toeic`, SITE)).toBeNull()
    }
  })

  it('reads a Google Sheets URL as a sheet even where a query could be misread', () => {
    // Precedence, settled by the origin check: docs.google.com is never ours.
    const withQuery = `https://docs.google.com/spreadsheets/d/${ID}/edit?s=other&gid=99`
    expect(parseSheetInput(withQuery, SITE)).toMatchObject({ sheetId: ID, gid: '99' })
  })

  it('takes nobody else\'s word for how to read a deck', () => {
    // &md=1 changes how every card is rendered. It is ours to set, not a
    // stranger's — and the deck it arrived with is not loading anyway.
    expect(markdownFromInput(`https://not-sokki.example/?s=${ID}&md=1`, SITE)).toBeUndefined()
    expect(markdownFromInput(`${SITE}/?s=${ID}&md=1`, SITE)).toBe(true)
  })

  it('goes quiet where there is no document to take an origin from', () => {
    // The default in a test, and in anything else without a location. Nothing
    // is ours, so nothing claiming to be gets read.
    expect(parseSheetInput(`${SITE}/?d=toeic`)).toBeNull()
    expect(markdownFromInput(`${SITE}/?s=${ID}&md=1`)).toBeUndefined()
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
    const parsed = refFromParams(new URLSearchParams(refToQuery(ref).slice(1)))
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

/*
 * The Markdown flag travels in the link rather than only in local storage, so
 * that what a recipient sees matches what the sharer saw. It is deliberately
 * not part of the deck's identity.
 */
describe('the markdown parameter', () => {
  it('is absent by default, so the shortest link stays the common one', () => {
    expect(refToQuery({ kind: 'builtin', id: 'toeic' })).toBe('?d=toeic')
    expect(refToQuery({ kind: 'sheet', sheetId: ID, gid: '0', title: undefined })).toBe(`?s=${ID}`)
  })

  it('is added only when on', () => {
    expect(refToQuery({ kind: 'builtin', id: 'toeic' }, true)).toBe('?d=toeic&md=1')
    expect(refToQuery({ kind: 'sheet', sheetId: ID, gid: '0', title: undefined }, true)).toBe(
      `?s=${ID}&md=1`,
    )
  })

  it('round-trips', () => {
    const query = refToQuery({ kind: 'sheet', sheetId: ID, gid: '7', title: 'N5' }, true)
    const params = new URLSearchParams(query.slice(1))
    expect(refFromParams(params)).toMatchObject({ sheetId: ID, gid: '7', title: 'N5' })
    expect(markdownFromParams(params)).toBe(true)
  })

  it('separates "said nothing" from "said off"', () => {
    // Undefined leaves the reader's stored preference for the deck alone; false
    // is a sharer who turned it off and copied the link again.
    expect(markdownFromParams(new URLSearchParams(`s=${ID}`))).toBeUndefined()
    expect(markdownFromParams(new URLSearchParams(`s=${ID}&md=0`))).toBe(false)
    expect(markdownFromParams(new URLSearchParams(`s=${ID}&md=1`))).toBe(true)
  })

  it('stays out of the deck key, so turning it on does not orphan a round', () => {
    const plain = refFromParams(new URLSearchParams(`s=${ID}`))!
    const formatted = refFromParams(new URLSearchParams(`s=${ID}&md=1`))!
    expect(deckKey(formatted)).toBe(deckKey(plain))
  })

  it('survives a link pasted into the box instead of clicked', () => {
    expect(markdownFromInput(`${SITE}/?s=${ID}&md=1`, SITE)).toBe(true)
    expect(markdownFromInput(`${SITE}/?s=${ID}`, SITE)).toBeUndefined()
    // A bare spreadsheet URL says nothing about it either way.
    const sheet = `https://docs.google.com/spreadsheets/d/${ID}/edit`
    expect(markdownFromInput(sheet, SITE)).toBeUndefined()
  })
})
