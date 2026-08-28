import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  answer,
  buildOrder,
  clearSession,
  currentIndex,
  facesFor,
  isFinished,
  loadSession,
  questionSide,
  retryWrong,
  saveSession,
  startSession,
  SESSION_TTL_MS,
} from './session'
import type { Session } from './types'

const KEY = 'test:deck'

beforeEach(() => {
  localStorage.clear()
})

describe('buildOrder', () => {
  it('uses every card when no limit is set', () => {
    expect(buildOrder(10, 0, false)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('trims to the requested size', () => {
    expect(buildOrder(47, 20, true)).toHaveLength(20)
  })

  it('never asks for more cards than the deck has', () => {
    expect(buildOrder(5, 100, true)).toHaveLength(5)
  })

  it('produces no duplicates when shuffling', () => {
    const order = buildOrder(200, 0, true)
    expect(new Set(order).size).toBe(200)
  })

  it('stays in source order when shuffle is off', () => {
    expect(buildOrder(5, 3, false)).toEqual([0, 1, 2])
  })

  it('copes with an empty deck', () => {
    expect(buildOrder(0, 10, true)).toEqual([])
  })
})

describe('answering', () => {
  function fresh(total = 3): Session {
    return startSession(total, { count: 0, shuffle: false, direction: 'front-back' })
  }

  it('advances and counts a correct answer', () => {
    const after = answer(fresh(), true)
    expect(after.pos).toBe(1)
    expect(after.firstTryCorrect).toBe(1)
    expect(after.wrong).toEqual([])
  })

  it('records a miss without counting it as correct', () => {
    const after = answer(fresh(), false)
    expect(after.wrong).toEqual([0])
    expect(after.firstTryCorrect).toBe(0)
  })

  it('finishes once every card has been seen', () => {
    let session = fresh(2)
    session = answer(session, true)
    expect(isFinished(session)).toBe(false)
    session = answer(session, true)
    expect(isFinished(session)).toBe(true)
    expect(currentIndex(session)).toBeNull()
  })

  it('does not mutate the session it was given', () => {
    const before = fresh()
    answer(before, false)
    expect(before.pos).toBe(0)
    expect(before.wrong).toEqual([])
  })
})

describe('retryWrong', () => {
  it('carries over only the misses, and resets the score', () => {
    let session = startSession(4, { count: 0, shuffle: false, direction: 'back-front' })
    session = answer(session, true)
    session = answer(session, false)
    session = answer(session, false)
    session = answer(session, true)

    const retry = retryWrong(session, false)
    expect(retry.order).toEqual([1, 2])
    expect(retry.firstTryCorrect).toBe(0)
    expect(retry.wrong).toEqual([])
    expect(retry.direction).toBe('back-front')
  })
})

describe('questionSide', () => {
  const base = startSession(4, { count: 0, shuffle: false, direction: 'mixed' })

  it('honours a fixed direction', () => {
    const fb = { ...base, direction: 'front-back' as const }
    expect(questionSide(fb, 0)).toBe('front')
    const bf = { ...base, direction: 'back-front' as const }
    expect(questionSide(bf, 2)).toBe('back')
  })

  it('is stable for a given card in mixed mode, so a re-render cannot flip it', () => {
    const first = questionSide(base, 1)
    expect(questionSide(base, 1)).toBe(first)
    expect(questionSide(base, 1)).toBe(first)
  })
})

describe('facesFor', () => {
  it('swaps question and answer with the side', () => {
    const card = { front: '犬', back: 'dog' }
    expect(facesFor(card, 'front')).toEqual({ question: '犬', answer: 'dog' })
    expect(facesFor(card, 'back')).toEqual({ question: 'dog', answer: '犬' })
  })
})

describe('persistence', () => {
  it('restores an interrupted round', () => {
    let session = startSession(5, { count: 0, shuffle: false, direction: 'front-back' })
    session = answer(session, true)
    saveSession(KEY, session)
    expect(loadSession(KEY, 5)).toEqual(session)
  })

  it('returns null once cleared', () => {
    saveSession(KEY, startSession(3, { count: 0, shuffle: false, direction: 'front-back' }))
    clearSession(KEY)
    expect(loadSession(KEY, 3)).toBeNull()
  })

  it('drops a round older than a day rather than resuming something forgotten', () => {
    const session = startSession(3, { count: 0, shuffle: false, direction: 'front-back' })
    saveSession(KEY, { ...session, startedAt: Date.now() - SESSION_TTL_MS - 1000 })
    expect(loadSession(KEY, 3)).toBeNull()
  })

  it('drops a round whose indices no longer fit the deck', () => {
    // The source is editable, so a sheet can shrink between two visits.
    saveSession(KEY, startSession(20, { count: 0, shuffle: false, direction: 'front-back' }))
    expect(loadSession(KEY, 5)).toBeNull()
  })

  it('does not resume a round that was already finished', () => {
    let session = startSession(1, { count: 0, shuffle: false, direction: 'front-back' })
    session = answer(session, true)
    saveSession(KEY, session)
    expect(loadSession(KEY, 1)).toBeNull()
  })

  it('starts over rather than crashing on corrupted storage', () => {
    localStorage.setItem(`sokki:session:${KEY}`, '{not json at all')
    expect(loadSession(KEY, 5)).toBeNull()
  })

  it('starts over on a saved round written by an incompatible build', () => {
    localStorage.setItem(`sokki:session:${KEY}`, JSON.stringify({ v: 99, pos: 3 }))
    expect(loadSession(KEY, 5)).toBeNull()
  })

  it('survives storage being unavailable entirely', () => {
    // Safari in private mode throws on access rather than returning null.
    const spy = vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(() => loadSession(KEY, 5)).not.toThrow()
    expect(loadSession(KEY, 5)).toBeNull()
    spy.mockRestore()
  })

  it('survives a write being refused, without losing the round in memory', () => {
    const spy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const session = startSession(3, { count: 0, shuffle: false, direction: 'front-back' })
    expect(() => saveSession(KEY, session)).not.toThrow()
    spy.mockRestore()
  })
})
