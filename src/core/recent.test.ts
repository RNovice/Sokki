import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearRecent,
  loadRecent,
  MAX_RECENT,
  refFromRecent,
  rememberDeck,
  renameRecent,
} from './recent'
import type { DeckRef } from './types'

const sheet = (sheetId: string, gid = '0', title?: string): DeckRef => ({
  kind: 'sheet',
  sheetId,
  gid,
  title,
})

/** Distinct, increasing timestamps so "most recent" is never a tie. */
let clock = 1_700_000_000_000
const tick = () => (clock += 1000)

beforeEach(() => {
  localStorage.clear()
  clock = 1_700_000_000_000
})

describe('what gets recorded', () => {
  it('starts empty', () => {
    expect(loadRecent()).toEqual([])
  })

  it('records a sheet', () => {
    const list = rememberDeck(sheet('abc', '0', 'N5'), 25, tick())
    expect(list).toEqual([
      { sheetId: 'abc', gid: '0', title: 'N5', lastOpened: clock, cardCount: 25 },
    ])
    expect(loadRecent()).toEqual(list)
  })

  it('ignores built-in decks', () => {
    // They are permanently listed under the samples, so letting them in would
    // spend the list on the four decks that cannot be lost.
    expect(rememberDeck({ kind: 'builtin', id: 'toeic' }, 25, tick())).toEqual([])
    expect(loadRecent()).toEqual([])
  })

  it('leaves the title out when the link carried none', () => {
    const list = rememberDeck(sheet('abc'), 25, tick())
    expect(list[0]).not.toHaveProperty('title')
  })

  it('records the card count, and refreshes it on the next open', () => {
    // Cached for display, so it is allowed to be stale — but only until the
    // deck is opened again, which is when it is read from the sheet anyway.
    rememberDeck(sheet('abc'), 25, tick())
    expect(loadRecent()[0]!.cardCount).toBe(25)
    expect(rememberDeck(sheet('abc'), 40, tick())[0]!.cardCount).toBe(40)
  })

  it('keeps a tab of the same sheet as its own entry', () => {
    rememberDeck(sheet('abc', '0'), 25, tick())
    const list = rememberDeck(sheet('abc', '77'), 25, tick())
    expect(list).toHaveLength(2)
  })
})

describe('ordering and eviction', () => {
  it('puts the newest first', () => {
    rememberDeck(sheet('one'), 25, tick())
    rememberDeck(sheet('two'), 25, tick())
    expect(loadRecent().map((e) => e.sheetId)).toEqual(['two', 'one'])
  })

  it('moves a deck to the front rather than duplicating it', () => {
    rememberDeck(sheet('one'), 25, tick())
    rememberDeck(sheet('two'), 25, tick())
    const list = rememberDeck(sheet('one'), 25, tick())
    expect(list.map((e) => e.sheetId)).toEqual(['one', 'two'])
    expect(list[0]!.lastOpened).toBe(clock)
  })

  it('caps the list, dropping the oldest', () => {
    for (let i = 0; i < MAX_RECENT + 3; i++) rememberDeck(sheet(`deck-${i}`), 25, tick())
    const list = loadRecent()
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0]!.sheetId).toBe(`deck-${MAX_RECENT + 2}`)
    expect(list.map((e) => e.sheetId)).not.toContain('deck-0')
  })
})

describe('titles', () => {
  it('takes a newer name over an older one', () => {
    rememberDeck(sheet('abc', '0', 'old'), 25, tick())
    expect(rememberDeck(sheet('abc', '0', 'new'), 25, tick())[0]!.title).toBe('new')
  })

  it('keeps a name we already had when a later link omits it', () => {
    // The same deck circulates both named and bare. Keeping the better of the
    // two beats taking the most recent of the two.
    rememberDeck(sheet('abc', '0', 'N5'), 25, tick())
    expect(rememberDeck(sheet('abc', '0'), 25, tick())[0]!.title).toBe('N5')
  })
})

describe('round trip and clearing', () => {
  it('reopens as the deck it came from', () => {
    const entry = rememberDeck(sheet('abc', '77', 'N5'), 25, tick())[0]!
    expect(refFromRecent(entry)).toEqual({
      kind: 'sheet',
      sheetId: 'abc',
      gid: '77',
      title: 'N5',
    })
  })

  it('clears', () => {
    rememberDeck(sheet('abc'), 25, tick())
    clearRecent()
    expect(loadRecent()).toEqual([])
  })
})

describe('bad data', () => {
  it('reads nonsense as an empty list rather than throwing', () => {
    // The store is editable from the console and writable by older builds; a
    // study app must never show a blank screen because of what is in it.
    for (const junk of ['not json', '{}', '[{"sheetId":1}]', '[{"sheetId":"a","gid":"0","lastOpened":1}]', '[null]', '"[]"']) {
      localStorage.setItem('sokki:recent', junk)
      expect(loadRecent()).toEqual([])
    }
  })

  it('recovers by overwriting on the next open', () => {
    localStorage.setItem('sokki:recent', 'not json')
    expect(rememberDeck(sheet('abc'), 25, tick())).toHaveLength(1)
  })
})

describe('renaming', () => {
  it('changes the name without reordering the list', () => {
    // Recency is about visits. A rename is an edit, and jumping a deck to the
    // top for one would make the ordering mean two different things.
    rememberDeck(sheet('one'), 25, tick())
    rememberDeck(sheet('two'), 25, tick())
    const opened = loadRecent()[1]!.lastOpened

    const list = renameRecent(sheet('one'), '日文 N5 動詞')
    expect(list.map((e) => e.sheetId)).toEqual(['two', 'one'])
    expect(list[1]!.title).toBe('日文 N5 動詞')
    expect(list[1]!.lastOpened).toBe(opened)
  })

  it('clears the name when given an empty one', () => {
    rememberDeck(sheet('abc', '0', 'N5'), 25, tick())
    expect(renameRecent(sheet('abc'), '')[0]).not.toHaveProperty('title')
  })

  it('leaves other decks alone, including the same sheet on another tab', () => {
    rememberDeck(sheet('abc', '0', 'first'), 25, tick())
    rememberDeck(sheet('abc', '77', 'second'), 25, tick())
    const list = renameRecent(sheet('abc', '0'), 'renamed')
    expect(list.find((e) => e.gid === '77')!.title).toBe('second')
    expect(list.find((e) => e.gid === '0')!.title).toBe('renamed')
  })

  it('does nothing for a deck that was never recorded', () => {
    expect(renameRecent(sheet('never-seen'), 'x')).toEqual([])
  })
})
