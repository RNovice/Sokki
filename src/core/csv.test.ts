import { describe, expect, it } from 'vitest'
import { parseCsv, parseDeckCsv } from './csv'

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('見る,"to see, to watch"')).toEqual([['見る', 'to see, to watch']])
  })

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('q,"line one\nline two"\nnext,row')).toEqual([
      ['q', 'line one\nline two'],
      ['next', 'row'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('word,"he said ""hi"""')).toEqual([['word', 'he said "hi"']])
  })

  it('strips the BOM Excel writes, so the first card is not poisoned', () => {
    expect(parseCsv('﻿犬,dog')).toEqual([['犬', 'dog']])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('does not invent a trailing row from a trailing newline', () => {
    expect(parseCsv('a,b\n')).toHaveLength(1)
  })

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('keeps empty fields rather than collapsing them', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })
})

describe('parseDeckCsv', () => {
  it('takes column A as the front and column B as the back, with no header row', () => {
    const { cards } = parseDeckCsv('食べる,to eat\n飲む,to drink')
    expect(cards).toEqual([
      { front: '食べる', back: 'to eat' },
      { front: '飲む', back: 'to drink' },
    ])
  })

  it('ignores extra columns instead of rejecting the sheet', () => {
    const { cards } = parseDeckCsv('犬,dog,noun,extra')
    expect(cards).toEqual([{ front: '犬', back: 'dog' }])
  })

  it('skips blank separator rows without counting them as problems', () => {
    const { cards, skipped } = parseDeckCsv('犬,dog\n\n猫,cat')
    expect(cards).toHaveLength(2)
    expect(skipped).toBe(0)
  })

  it('skips a row that has an answer but no question, and says so', () => {
    const { cards, skipped } = parseDeckCsv('犬,dog\n,orphan answer')
    expect(cards).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('trims surrounding whitespace from both faces', () => {
    const { cards } = parseDeckCsv('  犬  ,  dog  ')
    expect(cards[0]).toEqual({ front: '犬', back: 'dog' })
  })

  it('allows a card with no answer — an empty back is a real state', () => {
    const { cards } = parseDeckCsv('犬,')
    expect(cards).toEqual([{ front: '犬', back: '' }])
  })

  it('reads a header row as a card, which is why the docs say not to have one', () => {
    const { cards } = parseDeckCsv('正面,背面\n犬,dog')
    expect(cards[0]).toEqual({ front: '正面', back: '背面' })
  })
})
