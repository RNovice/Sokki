/**
 * Deck references: the URL is the entire state container.
 *
 * Everything needed to open a deck fits in the query string, which is what
 * makes a deck shareable by pasting a link and is why there is no account
 * system. Query parameters rather than path segments so the app runs on any
 * static host with no SPA-fallback configuration; unknown parameters are
 * ignored, so adding one later cannot break links already in circulation.
 *
 * The user never types or reads these parameters — they paste a Google Sheets
 * URL in and get a share link out. See parseSheetInput below.
 */

import { parseDeckCsv } from './csv'
import type { Card, DeckRef } from './types'

/* ------------------------------------------------------------------ builtin */

export interface BuiltinDeck {
  id: string
  /** Shown on the landing page; translated at render time via i18n keys. */
  titleKey: string
  file: string
  cards: number
}

/**
 * Sample decks ship as static CSV alongside the app. They load through exactly
 * the same parser and quiz as a user's own sheet — only the source URL differs
 * — so they work offline and we are not maintaining four public spreadsheets.
 */
export const BUILTIN_DECKS: readonly BuiltinDeck[] = [
  { id: 'jp-n5', titleKey: 'deck.jpN5', file: '01-日文N5動詞.csv', cards: 25 },
  { id: 'toeic', titleKey: 'deck.toeic', file: '02-多益商用單字.csv', cards: 25 },
  { id: 'zh-ja', titleKey: 'deck.zhJa', file: '03-中日常會話.csv', cards: 25 },
  { id: 'jp-capitals', titleKey: 'deck.jpCapitals', file: '04-日本県庁所在地.csv', cards: 47 },
]

export function findBuiltin(id: string): BuiltinDeck | undefined {
  return BUILTIN_DECKS.find((d) => d.id === id)
}

/* -------------------------------------------------------------- identifiers */

/** Stable key for this deck's saved preferences and in-progress round. */
export function deckKey(ref: DeckRef): string {
  switch (ref.kind) {
    case 'sheet':
      return `sheet:${ref.sheetId}:${ref.gid}`
    case 'builtin':
      return `builtin:${ref.id}`
  }
}

/* ---------------------------------------------------------------- url <-> ref */

export function refFromParams(params: URLSearchParams): DeckRef | null {
  const builtin = params.get('d')
  if (builtin && findBuiltin(builtin)) return { kind: 'builtin', id: builtin }

  const sheetId = params.get('s')
  if (sheetId && isSheetId(sheetId)) {
    const gid = params.get('g') ?? '0'
    const title = params.get('t') ?? undefined
    return { kind: 'sheet', sheetId, gid: /^\d+$/.test(gid) ? gid : '0', title }
  }

  return null
}

/**
 * Whether a link asks for its card text to be read as Markdown, or says nothing
 * about it.
 *
 * Undefined and false are different answers. Absent means the reader's own
 * stored preference for this deck stands; `md=0` is an explicit "plain", which
 * is what a sharer who turned it off and re-copied the link intends.
 *
 * Read separately from refFromParams because this is not part of the deck's
 * identity — the same spreadsheet is the same deck either way, and folding it
 * into DeckRef would put it in the key that names the saved round.
 */
export function markdownFromParams(params: URLSearchParams): boolean | undefined {
  const value = params.get('md')
  if (value === null) return undefined
  return value === '1' || value === 'true'
}

/** Every deck has a share link; that is the point of having only URL sources. */
export function refToQuery(ref: DeckRef, markdown = false): string {
  const params =
    ref.kind === 'builtin'
      ? new URLSearchParams({ d: ref.id })
      : new URLSearchParams({ s: ref.sheetId })

  if (ref.kind === 'sheet') {
    if (ref.gid !== '0') params.set('g', ref.gid)
    if (ref.title) params.set('t', ref.title)
  }
  // Only when on: the default has to stay the shortest link, and an absent
  // parameter is also what leaves an existing reader's preference alone.
  if (markdown) params.set('md', '1')

  return `?${params}`
}

export function shareUrl(
  ref: DeckRef,
  markdown = false,
  origin = location.origin + location.pathname,
): string {
  return origin + refToQuery(ref, markdown)
}

/* ------------------------------------------------------------ source parsing */

const SHEET_ID = /^[a-zA-Z0-9\-_]{20,}$/

function isSheetId(value: string): boolean {
  return SHEET_ID.test(value)
}

/**
 * The query of a pasted link, whoever served it.
 *
 * There is no hint in the interface that the paste box takes our own share
 * links, and there does not need to be: someone who has one has it because
 * somebody sent it to them, and pasting a link where you paste links is the
 * first thing they will try.
 *
 * This checked the origin for a while, on the reasoning that `s` and `d` are
 * ordinary parameter names and a link from elsewhere should not be able to open
 * a deck. The reasoning does not survive being stated plainly: a link from
 * elsewhere opening a deck is not something the check prevents, because anyone
 * who wants you to open their deck can send you a real share link. It only
 * refused the disguised version of something already allowed, while refusing
 * real share links too — a production link pasted into a local build, or into
 * any preview or renamed hostname, is one of ours and was being rejected.
 *
 * What makes reading a stranger's query safe is not where it came from. It is
 * that refFromParams validates every part of it: the sheet id against a
 * character class, the tab against digits, the deck id against the four that
 * exist. The id it yields is then only ever interpolated into a fixed
 * docs.google.com template, and connect-src allows nothing else, so there is no
 * URL here for anyone to choose.
 *
 * Parsed as a URL rather than sliced at the first `?`, which is what this used
 * to do: that treated a `#fragment` as part of the query, so an editor URL's
 * `#gid=` landed inside the value of whichever parameter came last.
 *
 * The base is what keeps the URL parser from being *less* forgiving than the
 * slicing was. Without one, `new URL` rejects everything that is not absolute —
 * a bare `?s=…`, a root-relative `/?s=…`, a protocol-relative `//host/?s=…` —
 * all of which used to parse. Its origin is never read; `.invalid` is the
 * reserved TLD, so nothing here can resolve to a real host by accident.
 */
const RELATIVE_BASE = 'https://sokki.invalid/'

function linkParams(input: string): URLSearchParams | null {
  try {
    return new URL(input, RELATIVE_BASE).searchParams
  } catch {
    // Nothing a URL can be made of at all.
    return null
  }
}

/**
 * Accepts anything a user could plausibly paste, because the alternative is
 * teaching them a URL format:
 *
 *   - the Share dialog's link, with or without `?usp=sharing`
 *   - an editor URL carrying the tab in `#gid=`
 *   - a published-to-web URL (`/d/e/2PACX-.../pubhtml`)
 *   - a share link this app produced
 *   - a bare spreadsheet id
 *
 * Returns null instead of throwing so the input field can hint while the user
 * is still typing.
 */
export function parseSheetInput(raw: string): DeckRef | null {
  const input = raw.trim()
  if (!input) return null

  // A link this app produced. Read it back through the same code that made it.
  const ours = linkParams(input)
  if (ours) {
    const fromOurs = refFromParams(ours)
    if (fromOurs) return fromOurs
  }

  const byUrl = /\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9\-_]{20,})/.exec(input)
  if (byUrl?.[1]) {
    const gid = /[#?&]gid=(\d+)/.exec(input)?.[1] ?? '0'
    return { kind: 'sheet', sheetId: byUrl[1], gid, title: undefined }
  }

  if (isSheetId(input)) return { kind: 'sheet', sheetId: input, gid: '0', title: undefined }

  return null
}

/**
 * The Markdown flag on a pasted link, if it carries one. Companion to
 * parseSheetInput rather than part of it, for the same reason
 * markdownFromParams is separate: it describes how to read the deck, not which
 * deck it is.
 */
export function markdownFromInput(raw: string): boolean | undefined {
  const params = linkParams(raw.trim())
  return params ? markdownFromParams(params) : undefined
}

/* ------------------------------------------------------------------ fetching */

export function sourceUrl(ref: DeckRef, base = import.meta.env.BASE_URL): string | null {
  if (ref.kind === 'builtin') {
    const deck = findBuiltin(ref.id)
    return deck ? `${base}decks/${encodeURIComponent(deck.file)}` : null
  }
  const params = new URLSearchParams({ tqx: 'out:csv', gid: ref.gid })
  return `https://docs.google.com/spreadsheets/d/${ref.sheetId}/gviz/tq?${params}`
}

export function sheetEditUrl(ref: DeckRef): string | null {
  if (ref.kind !== 'sheet') return null
  return `https://docs.google.com/spreadsheets/d/${ref.sheetId}/edit#gid=${ref.gid}`
}

export type LoadFailure =
  | 'offline'
  | 'not-shared'
  | 'not-found'
  | 'empty'
  | 'unreadable'
  | 'network'

export class DeckLoadError extends Error {
  constructor(readonly reason: LoadFailure) {
    super(reason)
    this.name = 'DeckLoadError'
  }
}

/**
 * A sheet that is not link-shared answers with an HTML sign-in page and a 200,
 * not an HTTP error — so the content type, not the status, is what identifies
 * the most common failure.
 */
export async function loadDeck(ref: DeckRef, signal?: AbortSignal): Promise<Card[]> {
  const url = sourceUrl(ref)
  if (!url) throw new DeckLoadError('unreadable')

  let response: Response
  try {
    response = await fetch(url, { signal, redirect: 'follow' })
  } catch {
    throw new DeckLoadError(navigator.onLine === false ? 'offline' : 'network')
  }

  if (response.status === 404) throw new DeckLoadError('not-found')
  if (!response.ok) throw new DeckLoadError('network')

  const contentType = response.headers.get('content-type') ?? ''
  const body = await response.text()

  if (contentType.includes('text/html') || body.trimStart().startsWith('<')) {
    throw new DeckLoadError(ref.kind === 'sheet' ? 'not-shared' : 'unreadable')
  }

  const { cards } = parseDeckCsv(body)
  if (cards.length === 0) throw new DeckLoadError('empty')
  return cards
}
