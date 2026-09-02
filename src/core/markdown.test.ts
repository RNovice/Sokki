import { describe, expect, it } from 'vitest'
import {
  hasBlockStructure,
  needsFullWidth,
  parseInline,
  parseMarkdown,
  type Inline,
} from './markdown'

/** Flatten to a compact string so the assertions read like the markup. */
function show(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value
        case 'code':
          return `<code>${node.value}</code>`
        default:
          return `<${node.type}>${show(node.children)}</${node.type}>`
      }
    })
    .join('')
}

const inline = (source: string) => show(parseInline(source))

describe('inline emphasis', () => {
  it('reads the four supported wrappers', () => {
    expect(inline('**bold**')).toBe('<strong>bold</strong>')
    expect(inline('*italic*')).toBe('<em>italic</em>')
    expect(inline('~~gone~~')).toBe('<strike>gone</strike>')
    expect(inline('`code`')).toBe('<code>code</code>')
  })

  it('reads emphasis in the middle of a line', () => {
    expect(inline('a **b** c')).toBe('a <strong>b</strong> c')
  })

  it('nests', () => {
    expect(inline('**bold *and* more**')).toBe('<strong>bold <em>and</em> more</strong>')
  })

  it('prefers the longer delimiter', () => {
    // Otherwise `**x**` reads as an empty `<em>` followed by stray asterisks.
    expect(inline('**x**')).toBe('<strong>x</strong>')
  })
})

describe('inline: what must stay literal', () => {
  it('leaves multiplication alone', () => {
    // The reason there is a flanking rule at all, and why no escape character
    // is needed for the common case.
    expect(inline('2 * 3 * 4')).toBe('2 * 3 * 4')
    expect(inline('2 ** 3 ** 4')).toBe('2 ** 3 ** 4')
  })

  it('leaves underscores entirely alone', () => {
    expect(inline('snake_case')).toBe('snake_case')
    expect(inline('__init__')).toBe('__init__')
    expect(inline('_emphasis_')).toBe('_emphasis_')
  })

  it('leaves an unclosed delimiter as text', () => {
    expect(inline('3 * 4 = 12')).toBe('3 * 4 = 12')
    expect(inline('*unfinished')).toBe('*unfinished')
    expect(inline('a `b')).toBe('a `b')
  })

  it('will not wrap nothing', () => {
    expect(inline('****')).toBe('****')
    expect(inline('``')).toBe('``')
  })

  it('will not open on a space or close on one', () => {
    expect(inline('* leading*')).toBe('* leading*')
    expect(inline('*trailing *')).toBe('*trailing *')
  })

  it('keeps markers inside code spans visible', () => {
    expect(inline('`a **b** c`')).toBe('<code>a **b** c</code>')
  })

  it('has no HTML meaning at all', () => {
    // Nothing in the pipeline builds an HTML string, so tags are just text.
    expect(inline('<b>x</b>')).toBe('<b>x</b>')
    expect(inline('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('reads a backslash as a backslash', () => {
    // Escapes are deliberately not supported; the character must survive.
    expect(inline('C:\\path')).toBe('C:\\path')
    expect(inline('\\*starred\\*')).toBe('\\<em>starred\\</em>')
  })
})

describe('blocks', () => {
  it('reads all six heading levels', () => {
    for (let level = 1; level <= 6; level++) {
      const blocks = parseMarkdown('#'.repeat(level) + ' Title')
      expect(blocks).toEqual([
        { type: 'heading', level, children: [{ type: 'text', value: 'Title' }] },
      ])
    }
  })

  it('needs a space after the hashes', () => {
    const blocks = parseMarkdown('#hashtag')
    expect(blocks[0]?.type).toBe('lines')
  })

  it('stops at six hashes', () => {
    expect(parseMarkdown('####### seven')[0]?.type).toBe('lines')
  })

  it('gathers consecutive quote lines into one block', () => {
    const blocks = parseMarkdown('> one\n> two')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'quote' })
    expect(blocks[0]?.type === 'quote' && blocks[0].lines.map(show)).toEqual(['one', 'two'])
  })

  it('gathers consecutive list items into one list', () => {
    const blocks = parseMarkdown('- one\n- two\n- three')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type === 'list' && blocks[0].items.map(show)).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('does not treat a bare dash as a list item', () => {
    expect(parseMarkdown('-')[0]?.type).toBe('lines')
    expect(parseMarkdown('-no space')[0]?.type).toBe('lines')
  })

  it('reads a thematic break', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'rule' }])
    expect(parseMarkdown('-----')).toEqual([{ type: 'rule' }])
  })

  it('reads a break rather than an empty list item', () => {
    // `---` matches neither list pattern, but the ordering still matters and
    // this pins it.
    expect(parseMarkdown('- a\n---\n- b').map((b) => b.type)).toEqual(['list', 'rule', 'list'])
  })

  it('runs the inline parser inside every block kind', () => {
    const blocks = parseMarkdown('# **h**\n> *q*\n- `i`')
    expect(blocks[0]?.type === 'heading' && show(blocks[0].children)).toBe('<strong>h</strong>')
    expect(blocks[1]?.type === 'quote' && show(blocks[1].lines[0]!)).toBe('<em>q</em>')
    expect(blocks[2]?.type === 'list' && show(blocks[2].items[0]!)).toBe('<code>i</code>')
  })
})

describe('whitespace', () => {
  it('keeps every line break', () => {
    // Markdown normally joins these into one paragraph. Turning the setting on
    // must not silently reflow text somebody already laid out in their sheet.
    const blocks = parseMarkdown('one\ntwo\nthree')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type === 'lines' && blocks[0].lines).toHaveLength(3)
  })

  it('keeps blank lines', () => {
    const blocks = parseMarkdown('one\n\ntwo')
    expect(blocks[0]?.type === 'lines' && blocks[0].lines.map(show)).toEqual(['one', '', 'two'])
  })

  it('does not lose a line to an adjacent block', () => {
    const blocks = parseMarkdown('before\n# head\nafter')
    expect(blocks.map((b) => b.type)).toEqual(['lines', 'heading', 'lines'])
  })

  it('reads empty input as nothing at all', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n')).toEqual([])
  })

  it('drops the blank line that only separates two blocks', () => {
    // Otherwise the gap between blocks and the blank line both apply, and a
    // list sits twice as far from its heading as anything else on the card.
    expect(parseMarkdown('- a\n\n> b').map((b) => b.type)).toEqual(['list', 'quote'])
    expect(parseMarkdown('---\n\ntail')).toEqual([
      { type: 'rule' },
      { type: 'lines', lines: [[{ type: 'text', value: 'tail' }]] },
    ])
  })
})

describe('hasBlockStructure', () => {
  it('is false for ordinary text, however emphasised', () => {
    // The overwhelmingly common card: a word, maybe bolded. It stays centred.
    expect(hasBlockStructure(parseMarkdown('こんにちは'))).toBe(false)
    expect(hasBlockStructure(parseMarkdown('**hello**\nworld'))).toBe(false)
  })

  it('is true once any structure appears', () => {
    for (const source of ['# h', '> q', '- i']) {
      expect(hasBlockStructure(parseMarkdown(source))).toBe(true)
    }
  })

  it('is not tripped by a thematic break', () => {
    // A divider between two centred lines leaves them centred. Width is a
    // separate question, answered by needsFullWidth below.
    expect(hasBlockStructure(parseMarkdown('---'))).toBe(false)
    expect(hasBlockStructure(parseMarkdown('above\n---\nbelow'))).toBe(false)
    // …but a rule among real blocks does not rescue them from being blocks.
    expect(hasBlockStructure(parseMarkdown('- a\n---\n- b'))).toBe(true)
  })
})

describe('needsFullWidth', () => {
  it('is true for a thematic break, which hasBlockStructure is not', () => {
    // The two must not be folded together. A face left shrink-to-fit draws the
    // rule only as wide as the word above it, which reads as a strikethrough.
    for (const source of ['---', 'above\n---\nbelow']) {
      expect(needsFullWidth(parseMarkdown(source))).toBe(true)
      expect(hasBlockStructure(parseMarkdown(source))).toBe(false)
    }
  })

  it('is true for every other block too', () => {
    for (const source of ['# h', '> q', '- i']) {
      expect(needsFullWidth(parseMarkdown(source))).toBe(true)
    }
  })

  it('is false for text, which keeps shrinking to fit and staying centred', () => {
    expect(needsFullWidth(parseMarkdown('こんにちは'))).toBe(false)
    expect(needsFullWidth(parseMarkdown('**hello**\nworld'))).toBe(false)
  })
})
