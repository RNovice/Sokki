/**
 * A deliberately small Markdown subset for card text.
 *
 * It parses to a data structure and never to HTML. That is the whole security
 * argument: card text comes from a public spreadsheet anyone can edit and share
 * a link to, so it is untrusted input. With no HTML string anywhere in the
 * pipeline, injection is not filtered out — it has no path to take.
 *
 * What is supported, and the reasons for the shape of it:
 *
 *   **bold**  *italic*  `code`  ~~strike~~
 *   # heading   > quote   - list   ---
 *
 *   - Only `*` for emphasis, never `_`. CommonMark's rule that `_` needs word
 *     boundaries exists so `snake_case` survives; implementing that rule
 *     incorrectly eats identifiers, and not accepting `_` at all cannot.
 *   - Only `-` for list items, never `*` or `+`. A line starting `* ` is
 *     otherwise ambiguous between a list and emphasis.
 *   - No backslash escapes, by decision. Their job is mostly done by the
 *     flanking rule below; what is lost is any way to show a literal `*pair*`.
 *   - No links, images or raw HTML. Links would fight the tap that turns the
 *     card over, and each of the three is an injection surface.
 *   - No tables or fenced code blocks. Both need more width than a card has,
 *     and the only way to give them that is horizontal scrolling inside the
 *     card, which would fight the swipe that answers it.
 *
 * Newlines are significant. Every line break in the sheet is a line break on
 * the card, rather than being collapsed the way Markdown normally collapses
 * them: turning this on should not silently reflow text somebody already wrote.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'strike'; children: Inline[] }

export type Block =
  | { type: 'lines'; lines: Inline[][] }
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'quote'; lines: Inline[][] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'rule' }

/* ------------------------------------------------------------------ inline */

const WRAPPERS = [
  { delimiter: '**', type: 'strong' },
  { delimiter: '~~', type: 'strike' },
  { delimiter: '*', type: 'em' },
] as const

/**
 * A delimiter pair only counts when what it encloses is non-empty and touches
 * neither delimiter with whitespace. This is the useful half of CommonMark's
 * flanking rules, and it is what keeps `2 * 3 * 4` literal without needing an
 * escape character.
 */
function encloses(content: string): boolean {
  return content.length > 0 && !/^\s/.test(content) && !/\s$/.test(content)
}

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = []
  let plain = ''

  const flush = () => {
    if (plain) nodes.push({ type: 'text', value: plain })
    plain = ''
  }

  let i = 0
  while (i < text.length) {
    const char = text[i]!

    // Code spans win over everything: their content is literal, so emphasis
    // markers inside a snippet stay visible.
    if (char === '`') {
      const close = text.indexOf('`', i + 1)
      const content = close === -1 ? null : text.slice(i + 1, close)
      if (content) {
        flush()
        nodes.push({ type: 'code', value: content })
        i = close + 1
        continue
      }
    }

    const wrapper = WRAPPERS.find((w) => text.startsWith(w.delimiter, i))
    if (wrapper) {
      const from = i + wrapper.delimiter.length
      const close = text.indexOf(wrapper.delimiter, from)
      const content = close === -1 ? null : text.slice(from, close)
      if (content !== null && encloses(content)) {
        flush()
        nodes.push({ type: wrapper.type, children: parseInline(content) })
        i = close + wrapper.delimiter.length
        continue
      }
    }

    plain += char
    i++
  }

  flush()
  return nodes
}

/* ------------------------------------------------------------------- block */

const HEADING = /^(#{1,6})\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const ITEM = /^-\s+(.+)$/
const RULE = /^ {0,3}-{3,}\s*$/

export function parseMarkdown(source: string): Block[] {
  const lines = source.split('\n')
  const blocks: Block[] = []
  let i = 0

  /** Collect a run of lines that all match the same block prefix. */
  const runOf = (pattern: RegExp): Inline[][] => {
    const collected: Inline[][] = []
    while (i < lines.length) {
      const matched = pattern.exec(lines[i]!)
      if (!matched) break
      collected.push(parseInline(matched[1] ?? ''))
      i++
    }
    return collected
  }

  while (i < lines.length) {
    const line = lines[i]!

    // Before the heading check, because `---` also matches nothing else here.
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        children: parseInline(heading[2] ?? ''),
      })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      blocks.push({ type: 'quote', lines: runOf(QUOTE) })
      continue
    }

    if (ITEM.test(line)) {
      blocks.push({ type: 'list', items: runOf(ITEM) })
      continue
    }

    // Everything else is ordinary text, gathered until the next block starts.
    const plain: string[] = []
    while (i < lines.length) {
      const next = lines[i]!
      if (RULE.test(next) || HEADING.test(next) || QUOTE.test(next) || ITEM.test(next)) break
      plain.push(next)
      i++
    }

    /*
     * A blank line touching a block is separation, not content. The space
     * between blocks already says what it was written to say, and keeping it
     * as well sets a list twice as far from its heading as anything else.
     * Blank lines *between* two lines of text are the reader's own spacing and
     * stay exactly where they are — that is the whole point of not collapsing.
     */
    while (plain.length && plain[0]!.trim() === '') plain.shift()
    while (plain.length && plain[plain.length - 1]!.trim() === '') plain.pop()

    if (plain.length) blocks.push({ type: 'lines', lines: plain.map(parseInline) })
  }

  return blocks
}

/*
 * Two separate questions about a face, and keeping them separate is the point:
 * how wide the text box should be, and how the text inside it should be set.
 * A thematic break answers the first and not the second.
 */

/**
 * Whether the face must span the card rather than shrink to fit its longest
 * line. A rule drawn across a box only as wide as the word above it reads as a
 * strikethrough, not a divider — so a rule widens the face while leaving
 * everything else about it alone.
 */
export function needsFullWidth(blocks: Block[]): boolean {
  return blocks.some((block) => block.type !== 'lines')
}

/**
 * Whether the face holds anything that reads badly centred. A card centres its
 * text, which suits a word and ruins a list, so a face with structure is
 * aligned left at reading size instead.
 *
 * A thematic break is excluded. Once the face is full width the rule already
 * looks right, and `above / --- / below` is still two centred lines with a
 * divider between them — nothing there wants to be left-aligned. A rule sitting
 * among real blocks changes nothing either: those blocks have already answered
 * this question.
 */
export function hasBlockStructure(blocks: Block[]): boolean {
  return blocks.some((block) => block.type !== 'lines' && block.type !== 'rule')
}
