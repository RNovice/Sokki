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

/** Every deck has a share link; that is the point of having only URL sources. */
export function refToQuery(ref: DeckRef): string {
  if (ref.kind === 'builtin') return `?d=${encodeURIComponent(ref.id)}`

  const params = new URLSearchParams({ s: ref.sheetId })
  if (ref.gid !== '0') params.set('g', ref.gid)
  if (ref.title) params.set('t', ref.title)
  return `?${params}`
}

export function shareUrl(ref: DeckRef, origin = location.origin + location.pathname): string {
  return origin + refToQuery(ref)
}

/* ------------------------------------------------------------ source parsing */

const SHEET_ID = /^[a-zA-Z0-9\-_]{20,}$/

function isSheetId(value: string): boolean {
  return SHEET_ID.test(value)
}

/**
 * Accepts anything a user could plausibly paste, because the alternative is
 * teaching them a URL format:
 *
 *   - the Share dialog's link, with or without `?usp=sharing`
 *   - an editor URL carrying the tab in `#gid=`
 *   - a published-to-web URL (`/d/e/2PACX-.../pubhtml`)
 *   - a link this app produced earlier
 *   - a bare spreadsheet id
 *
 * Returns null instead of throwing so the input field can hint while the user
 * is still typing.
 */
export function parseSheetInput(raw: string): DeckRef | null {
  const input = raw.trim()
  if (!input) return null

  // A link this app produced. Read it back through the same code that made it.
  if (input.includes('?') || input.includes('&')) {
    const queryStart = input.indexOf('?')
    if (queryStart !== -1) {
      const fromOurs = refFromParams(new URLSearchParams(input.slice(queryStart + 1)))
      if (fromOurs) return fromOurs
    }
  }

  const byUrl = /\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9\-_]{20,})/.exec(input)
  if (byUrl?.[1]) {
    const gid = /[#?&]gid=(\d+)/.exec(input)?.[1] ?? '0'
    return { kind: 'sheet', sheetId: byUrl[1], gid, title: undefined }
  }

  if (isSheetId(input)) return { kind: 'sheet', sheetId: input, gid: '0', title: undefined }

  return null
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
