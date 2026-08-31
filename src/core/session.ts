/**
 * A round of study.
 *
 * A session is a shuffled list of indices and a cursor. It is saved so that
 * switching apps on a phone — which routinely tears down the page — does not
 * throw away the round, and it expires after a day so that returning next week
 * does not silently resume something long forgotten.
 *
 * It is deliberately not a record of learning. Nothing here accumulates across
 * rounds, and nothing identifies the person studying.
 */

import { capSessions, readJson, remove, writeJson } from './storage'
import type { Card, Direction, Session } from './types'

/** A saved round older than this is stale; start fresh instead. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const MAX_SAVED_SESSIONS = 10

/* ------------------------------------------------------------------ building */

/** Fisher–Yates. */
function shuffled(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = order[i]!
    order[i] = order[j]!
    order[j] = a
  }
  return order
}

/**
 * How many cards a round will hold. Zero means the whole deck, and a count
 * larger than the deck is capped rather than refused.
 *
 * Exported because the deck screen needs the same answer to tell whether the
 * settings on display would build a different round from the one in progress,
 * and two copies of this rule would eventually disagree.
 */
export function roundSize(total: number, count: number): number {
  return count > 0 ? Math.min(count, total) : total
}

/**
 * Pick the cards for a round. With no persistence there is no way to avoid
 * repeating what came up last time — this is a random draw, and the interface
 * says so rather than implying a schedule.
 */
export function buildOrder(total: number, count: number, shuffle: boolean): number[] {
  const all = shuffle ? shuffled(total) : Array.from({ length: total }, (_, i) => i)
  return all.slice(0, roundSize(total, count))
}

export function startSession(
  total: number,
  options: { count: number; shuffle: boolean; direction: Direction },
): Session {
  return {
    v: 1,
    order: buildOrder(total, options.count, options.shuffle),
    pos: 0,
    wrong: [],
    firstTryCorrect: 0,
    startedAt: Date.now(),
    direction: options.direction,
  }
}

/** Retry only what was missed, keeping the same direction. */
export function retryWrong(previous: Session, shuffle: boolean): Session {
  const order = shuffle ? shuffleList(previous.wrong) : [...previous.wrong]
  return {
    v: 1,
    order,
    pos: 0,
    wrong: [],
    firstTryCorrect: 0,
    startedAt: Date.now(),
    direction: previous.direction,
  }
}

function shuffleList(list: readonly number[]): number[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return out
}

/* ----------------------------------------------------------------- advancing */

export function currentIndex(session: Session): number | null {
  return session.pos < session.order.length ? (session.order[session.pos] ?? null) : null
}

export function isFinished(session: Session): boolean {
  return session.pos >= session.order.length
}

export function answer(session: Session, knew: boolean): Session {
  const index = currentIndex(session)
  if (index === null) return session
  return {
    ...session,
    pos: session.pos + 1,
    wrong: knew ? session.wrong : [...session.wrong, index],
    firstTryCorrect: knew ? session.firstTryCorrect + 1 : session.firstTryCorrect,
  }
}

/** Which face is the question for this card, resolving `mixed` deterministically. */
export function questionSide(session: Session, position: number): 'front' | 'back' {
  if (session.direction === 'front-back') return 'front'
  if (session.direction === 'back-front') return 'back'
  // Keyed on the card index rather than a coin flip, so re-rendering the same
  // card during a round never silently swaps the sides under the user.
  const index = session.order[position] ?? 0
  return (index + session.startedAt) % 2 === 0 ? 'front' : 'back'
}

export function facesFor(
  card: Card,
  side: 'front' | 'back',
): { question: string; answer: string } {
  return side === 'front'
    ? { question: card.front, answer: card.back }
    : { question: card.back, answer: card.front }
}

/* ---------------------------------------------------------------- persistence */

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<Session>
  return (
    s.v === 1 &&
    Array.isArray(s.order) &&
    s.order.every((n) => typeof n === 'number') &&
    typeof s.pos === 'number' &&
    Array.isArray(s.wrong) &&
    s.wrong.every((n) => typeof n === 'number') &&
    typeof s.firstTryCorrect === 'number' &&
    typeof s.startedAt === 'number' &&
    (s.direction === 'front-back' || s.direction === 'back-front' || s.direction === 'mixed')
  )
}

function name(deckKey: string): string {
  return `session:${deckKey}`
}

export function saveSession(deckKey: string, session: Session): void {
  writeJson(name(deckKey), session)
  capSessions(MAX_SAVED_SESSIONS)
}

export function clearSession(deckKey: string): void {
  remove(name(deckKey))
}

/**
 * Restore an interrupted round. Returns null — never throws — when there is
 * nothing to restore, when it has expired, or when it no longer fits the deck
 * (the source is editable, so the card count can change underneath a session).
 */
export function loadSession(deckKey: string, cardCount: number): Session | null {
  const saved = readJson(name(deckKey), isSession)
  if (!saved) return null

  if (Date.now() - saved.startedAt > SESSION_TTL_MS) {
    clearSession(deckKey)
    return null
  }
  if (saved.order.some((i) => i < 0 || i >= cardCount)) {
    clearSession(deckKey)
    return null
  }
  if (saved.pos < 0 || saved.pos > saved.order.length) {
    clearSession(deckKey)
    return null
  }
  if (isFinished(saved)) {
    clearSession(deckKey)
    return null
  }
  return saved
}
