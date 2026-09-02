/**
 * The decks you opened lately.
 *
 * This exists to close a hole the rest of the design opens. The URL is the
 * whole state container, which is what makes a deck shareable by pasting a
 * link — and it also means that closing the tab loses the deck. Somebody sends
 * you a link, you study it, you close it, and the only way back is the message
 * it arrived in. Nothing else in the app can answer "where did yesterday's deck
 * go".
 *
 * Recent rather than saved, and the reason is not convenience: saving demands
 * an action *before* you need the list, and the moment you discover you needed
 * it is always after you did not take that action. This asks for nothing.
 *
 * What it stores is what a share link already contains — a spreadsheet id, a
 * tab, and the name the sharer typed — plus when you last opened it. It does
 * not store card text. That is the same line `session` holds when it saves
 * indices instead of card objects.
 */

import { readJson, remove, writeJson } from './storage'
import type { DeckRef } from './types'

export interface RecentDeck {
  sheetId: string
  gid: string
  /** As the sharer named it. Absent when the link carried no name. */
  title?: string
  lastOpened: number
  /**
   * How many cards it had when last opened. A cached display value, not a
   * fact: the source is editable, so it can be out of date until the deck is
   * opened again — which is the moment it stops mattering.
   */
  cardCount: number
}

const NAME = 'recent'

/**
 * Twenty.
 *
 * Storage is not what decides this. One entry is 258 bytes of UTF-16, so twenty
 * is 5 KB — a tenth of a percent of the usual 5 MB quota, and tens of thousands
 * would still fit. The limit is what the word "recent" can carry: a list long
 * enough to hold decks from months ago has stopped being a shortcut and become
 * a record of what you have studied, which is a thing this app should hold as
 * little of as it can.
 *
 * Twenty covers weeks of ordinary use and still scrolls in one screen of the
 * panel it lives in.
 */
export const MAX_RECENT = 20

function isRecentList(value: unknown): value is RecentDeck[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return false
      const e = entry as Partial<RecentDeck>
      return (
        typeof e.sheetId === 'string' &&
        typeof e.gid === 'string' &&
        typeof e.lastOpened === 'number' &&
        typeof e.cardCount === 'number' &&
        (e.title === undefined || typeof e.title === 'string')
      )
    })
  )
}

export function loadRecent(): RecentDeck[] {
  return readJson(NAME, isRecentList) ?? []
}

export function clearRecent(): void {
  remove(NAME)
}

/**
 * Change what a deck is called without touching when it was last opened.
 *
 * Renaming is not using: the list is ordered by recency, and a rename that
 * jumped a deck to the top would reorder the list for an edit rather than a
 * visit.
 */
export function renameRecent(ref: DeckRef, name: string): RecentDeck[] {
  if (ref.kind !== 'sheet') return loadRecent()

  const next = loadRecent().map((entry) => {
    if (entry.sheetId !== ref.sheetId || entry.gid !== ref.gid) return entry
    // Rebuilt without the title rather than set to undefined, so clearing a
    // name leaves no key behind for the guard to have an opinion about.
    const { title: _cleared, ...rest } = entry
    return name ? { ...rest, title: name } : rest
  })
  writeJson(NAME, next)
  return next
}

/** The same deck, as something the router can open. */
export function refFromRecent(entry: RecentDeck): DeckRef {
  return { kind: 'sheet', sheetId: entry.sheetId, gid: entry.gid, title: entry.title }
}

/**
 * Record a deck as just opened and return the new list, so the caller can put
 * it straight into state rather than reading it back.
 *
 * Built-in decks are skipped. They are permanently listed under the samples
 * already, and letting them in would spend the list on the four decks that can
 * never be lost.
 */
export function rememberDeck(ref: DeckRef, cardCount: number, now = Date.now()): RecentDeck[] {
  if (ref.kind !== 'sheet') return loadRecent()

  const existing = loadRecent()
  const previous = existing.find((e) => e.sheetId === ref.sheetId && e.gid === ref.gid)

  const entry: RecentDeck = {
    sheetId: ref.sheetId,
    gid: ref.gid,
    lastOpened: now,
    cardCount,
    // A link without a name does not erase a name we already had: the same
    // deck is often shared both ways, and keeping the better of the two is
    // strictly more useful than taking the most recent of the two.
    ...(ref.title || previous?.title ? { title: ref.title || previous?.title } : {}),
  }

  const next = [
    entry,
    ...existing.filter((e) => !(e.sheetId === ref.sheetId && e.gid === ref.gid)),
  ].slice(0, MAX_RECENT)

  writeJson(NAME, next)
  return next
}
