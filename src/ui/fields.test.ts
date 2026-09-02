import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every form field is identifiable, and none of them by an id.
 *
 * Chrome's Issues panel asks for an `id` or a `name` on each field so that it
 * can identify one for autofill. It is a tidiness item, not a correctness one —
 * the labels here are associated by wrapping, so every field already reports
 * the right accessible name — but the obvious way to satisfy it is the wrong
 * one, and that is what this pins.
 *
 * `id` is wrong because the field components are reused and a sheet does not
 * unmount the screen behind it: opening the settings sheet over a deck puts two
 * `Direction` selects in the document at once. One id shared between them is a
 * duplicate id, which *is* an accessibility fault — a worse one than the
 * warning being silenced. `name` carries no uniqueness requirement outside a
 * form, so it is the right tool.
 */

const UI = fileURLToPath(new URL('.', import.meta.url))

const sources = readdirSync(UI)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, text: readFileSync(join(UI, f), 'utf8') }))

/** Each `<input …>` / `<select …>` opening tag, attributes included. */
function fields(text: string): string[] {
  return [...text.matchAll(/<(?:input|select|textarea)\b([\s\S]*?)\/?>/g)].map((m) => m[1] ?? '')
}

describe('form fields', () => {
  it('all carry a name or an id, so none is unidentifiable', () => {
    const nameless = sources.flatMap(({ file, text }) =>
      fields(text)
        .filter((attrs) => !/\bname=/.test(attrs) && !/\bid=/.test(attrs))
        .map(() => file),
    )
    expect(nameless).toEqual([])
  })

  it('identify by name rather than id, because the components are reused', () => {
    // One id in the whole interface: the share link, which exists once and is
    // reached by getElementById when the clipboard is refused.
    const withId = sources.flatMap(({ file, text }) =>
      fields(text)
        .filter((attrs) => /\bid=/.test(attrs))
        .map((attrs) => `${file}: ${/\bid="([^"]*)"/.exec(attrs)?.[1] ?? '?'}`),
    )
    expect(withId).toEqual(['ShareSheet.tsx: share-link'])
  })
})
