import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeckRef } from './types'
import {
  DeckLoadError,
  deckKey,
  loadDeck,
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
    expect(parseSheetInput(ours)).toMatchObject({
      kind: 'sheet',
      sheetId: ID,
      gid: '12',
      title: '期中考範圍',
    })
  })

  it('takes a link to a builtin deck', () => {
    expect(parseSheetInput(`${SITE}/?d=toeic`)).toEqual({
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
 * try.
 *
 * It reads them whoever served them, which was briefly not the case. An origin
 * check stood here for a day. It refused a real share link pasted into a local
 * build, or any preview or renamed host, and prevented nothing in exchange:
 * anyone who wants you to open their deck can send you a genuine link, so the
 * check only turned away the disguised version of something already allowed.
 *
 * These pin what actually keeps a stranger's query harmless, which is
 * validation rather than provenance.
 */
describe('parseSheetInput, on links that carry a deck in their query', () => {
  it('reads one served from anywhere, because ours can be', () => {
    for (const host of [SITE, 'https://sokki.pages.dev', 'http://localhost:5173']) {
      expect(parseSheetInput(`${host}/?s=${ID}&g=12`)).toMatchObject({ sheetId: ID, gid: '12' })
    }
  })

  it('takes nothing on trust: every part of the query is checked', () => {
    // The sheet id against a character class, the tab against digits, the deck
    // id against the four that exist. This is what makes provenance moot — the
    // id that survives is only ever interpolated into a fixed Google template.
    expect(parseSheetInput('https://any.example/?s=short')).toBeNull()
    expect(parseSheetInput('https://any.example/?d=no-such-deck')).toBeNull()
    expect(parseSheetInput(`https://any.example/?s=${ID}&g=../evil`)).toMatchObject({ gid: '0' })
  })

  it('reads a Google Sheets URL as a sheet, query or no query', () => {
    const withQuery = `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing&gid=99`
    expect(parseSheetInput(withQuery)).toMatchObject({ sheetId: ID, gid: '99' })
  })

  it('still reads the shapes that are not absolute URLs', () => {
    // Parsing with `new URL` is stricter than slicing at the first `?`, and
    // was briefly strict enough to reject these — every one of which the
    // slicing version accepted. Nobody has a bare query in their clipboard,
    // but a parser whose whole promise is "paste whatever you have" should not
    // quietly get narrower.
    expect(parseSheetInput('?d=toeic')).toEqual({ kind: 'builtin', id: 'toeic' })
    expect(parseSheetInput(`?s=${ID}&g=8`)).toMatchObject({ sheetId: ID, gid: '8' })
    expect(parseSheetInput(`/?s=${ID}`)).toMatchObject({ sheetId: ID })
    expect(parseSheetInput(`//sokki.example/?s=${ID}`)).toMatchObject({ sheetId: ID })
    expect(markdownFromInput(`?s=${ID}&md=1`)).toBe(true)
  })

  it('does not mistake a fragment for part of the query', () => {
    // Sliced at the first `?`, as this once was, `#gid=847362` lands inside the
    // value of whichever parameter came last.
    expect(parseSheetInput(`https://any.example/?s=${ID}#gid=847362`)).toMatchObject({
      sheetId: ID,
    })
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
    expect(markdownFromInput(`${SITE}/?s=${ID}&md=1`)).toBe(true)
    expect(markdownFromInput(`${SITE}/?s=${ID}`)).toBeUndefined()
    // A bare spreadsheet URL says nothing about it either way.
    const sheet = `https://docs.google.com/spreadsheets/d/${ID}/edit`
    expect(markdownFromInput(sheet)).toBeUndefined()
  })
})

/**
 * Loading, and how each failure is told apart.
 *
 * None of this was covered, which is how loadDeck spent a long time believing
 * that an unshared sheet answers with an HTML sign-in page and a 200. It
 * answers with a redirect the browser refuses to follow across origins, so the
 * check written for that failure could not run and the reader was told to
 * check their connection instead. A stubbed fetch is enough to pin the whole
 * decision table; what it cannot pin — that gviz really does redirect — is
 * what the comment on loadDeck now records.
 */
describe('loadDeck', () => {
  const SHEET: DeckRef = { kind: 'sheet', sheetId: 'a'.repeat(24), gid: '0' }

  /** A fetch that answers the first call one way and any probe another. */
  function stubFetch(...answers: (Response | Error)[]) {
    let call = 0
    const fetch = vi.fn((_url: string, _init?: RequestInit) => {
      const answer = answers[Math.min(call++, answers.length - 1)]!
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const csv = (body: string) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/csv' } })

  const online = (value: boolean) => vi.stubGlobal('navigator', { onLine: value })

  afterEach(() => vi.unstubAllGlobals())

  it('reads a shared sheet', async () => {
    stubFetch(csv('front,back\nue,up'))
    await expect(loadDeck(SHEET)).resolves.toEqual([
      { front: 'front', back: 'back' },
      { front: 'ue', back: 'up' },
    ])
  })

  it('calls a sheet that answers 404 missing, not broken', async () => {
    stubFetch(new Response('', { status: 404 }))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'not-found' })
  })

  it('reads a refusal to our face as not shared', async () => {
    stubFetch(new Response('', { status: 401 }))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'not-shared' })
  })

  /*
   * The real one. The cross-origin sign-in redirect is rejected before it
   * yields anything, so the first call throws — and the probe that follows is
   * the only thing separating this from the network being down.
   */
  it('reads a rejected fetch the server still answered as not shared', async () => {
    online(true)
    /*
     * Any response object at all is the answer. The real one is an opaque
     * redirect — status 0, headers and body unreadable — which is precisely
     * why loadDeck reads its existence rather than anything in it, and why the
     * Response constructor here cannot be made to produce one.
     */
    const fetch = stubFetch(new TypeError('Failed to fetch'), new Response(''))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'not-shared' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]![1]).toMatchObject({ mode: 'no-cors', redirect: 'manual' })
  })

  it('reads a rejected fetch nobody answered as a network failure', async () => {
    online(true)
    stubFetch(new TypeError('Failed to fetch'), new TypeError('Failed to fetch'))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'network' })
  })

  it('says offline rather than guessing, when the browser already knows', async () => {
    online(false)
    const fetch = stubFetch(new TypeError('Failed to fetch'))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'offline' })
    // No probe: there is nothing to find out.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('spends no probe on a load nobody is waiting for', async () => {
    online(true)
    const controller = new AbortController()
    controller.abort()
    const fetch = stubFetch(new DOMException('Aborted', 'AbortError'))
    await expect(loadDeck(SHEET, controller.signal)).rejects.toBeInstanceOf(DeckLoadError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('still reads an HTML body as not shared, wherever one comes from', async () => {
    stubFetch(new Response('<!doctype html><html>', { status: 200 }))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'not-shared' })
  })

  it('separates a sheet with no rows from one that could not be read', async () => {
    stubFetch(csv('\n\n'))
    await expect(loadDeck(SHEET)).rejects.toMatchObject({ reason: 'empty' })
  })
})
