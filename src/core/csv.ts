/**
 * RFC 4180 CSV reader.
 *
 * Hand-written rather than a dependency: the input surface is exactly two
 * producers — Google Sheets' gviz export and files the user saved out of a
 * spreadsheet — and the only cases that matter are quoted fields containing
 * commas, newlines and escaped quotes. A parser for that is sixty lines, and
 * the budget for the entire app is 60 KB.
 */

import type { Card } from './types'

export function parseCsv(text: string): string[][] {
  // Excel writes a BOM. Left in place it would poison the first card's front.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]!

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      quoted = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += ch === '\r' && input[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch
    i++
  }

  // A trailing newline leaves nothing to flush; anything else is a final row.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Rows to cards. Column A is the front, column B is the back, and there is no
 * header row — the first line is the first card. Extra columns are ignored
 * rather than rejected, so a spreadsheet someone already keeps notes in still
 * works without being edited down.
 */
export function toCards(rows: string[][]): { cards: Card[]; skipped: number } {
  const cards: Card[] = []
  let skipped = 0

  for (const row of rows) {
    const front = (row[0] ?? '').trim()
    const back = (row[1] ?? '').trim()
    // A row with no question cannot be asked. Blank separator rows are common
    // in hand-kept vocabulary sheets, so this is a skip, not an error.
    if (!front) {
      if (row.some((cell) => cell.trim() !== '')) skipped++
      continue
    }
    cards.push({ front, back })
  }

  return { cards, skipped }
}

export function parseDeckCsv(text: string): { cards: Card[]; skipped: number } {
  return toCards(parseCsv(text))
}
