import type { ComponentChildren } from 'preact'
import { useMemo } from 'preact/hooks'
import {
  hasBlockStructure,
  needsFullWidth,
  parseMarkdown,
  type Block,
  type Inline,
} from '../core/markdown'

/**
 * Card text, with or without Markdown.
 *
 * Everything here builds Preact elements. Nothing builds an HTML string, and
 * nothing goes near dangerouslySetInnerHTML — card text comes from a public
 * spreadsheet, so it is untrusted, and the way to be safe from injection is for
 * there to be no path an injection could take rather than a filter it has to
 * get past. A card reading `<script>alert(1)</script>` shows those characters.
 *
 * Children are deliberately unkeyed. They are derived from the text by
 * position, so index reconciliation — which is what Preact does without keys —
 * is already the correct pairing; keys would add noise and change nothing.
 */

interface Props {
  text: string
  /** Off by default. Turned on per deck, and carried in the share link. */
  markdown: boolean
  /** The caller's own class; the layout around the text belongs to it. */
  class?: string
}

export function CardText({ text, markdown, class: className }: Props) {
  const blocks = useMemo(() => (markdown ? parseMarkdown(text) : null), [markdown, text])

  if (!blocks) return <div class={className}>{text}</div>

  /*
   * Two independent decisions. Any structure at all makes the face span the
   * card, because a divider has to reach both edges to be one. Structure that
   * is *prose* — a heading, a list, a quote — additionally goes left-aligned at
   * reading size, because centred prose is unreadable and question-size prose
   * overflows. A face holding a word, emphasised or not, is nearly every card
   * and gets neither.
   */
  const classes = [className, needsFullWidth(blocks) && 'md-wide', hasBlockStructure(blocks) && 'md-prose']
  return <div class={classes.filter(Boolean).join(' ')}>{blocks.map(block)}</div>
}

/* ----------------------------------------------------------------- rendering */

function inline(nodes: Inline[]): ComponentChildren {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text':
        return node.value
      case 'code':
        return <code class="md-code">{node.value}</code>
      case 'strong':
        return <strong>{inline(node.children)}</strong>
      case 'em':
        return <em>{inline(node.children)}</em>
      case 'strike':
        return <s>{inline(node.children)}</s>
    }
  })
}

/**
 * Lines within a block, with the breaks put back as real newline characters.
 * `white-space: pre-wrap` renders them, which is what keeps the sheet's own
 * layout intact: turning Markdown on must not silently reflow text somebody
 * already arranged by hand.
 */
function lines(rows: Inline[][]): ComponentChildren {
  return rows.flatMap((row, i) => (i === 0 ? [inline(row)] : ['\n', inline(row)]))
}

function block(node: Block): ComponentChildren {
  switch (node.type) {
    case 'lines':
      return <p class="md-lines">{lines(node.lines)}</p>

    case 'heading': {
      // The page's own h1 is the top bar, so a card's headings start at h2.
      // Six Markdown levels collapse onto five tags; the visual scale is
      // flattened anyway, because a card is not a document.
      const Tag = `h${Math.min(node.level + 1, 6)}` as 'h2'
      return <Tag class={`md-h md-h${node.level}`}>{inline(node.children)}</Tag>
    }

    case 'quote':
      return <blockquote class="md-quote">{lines(node.lines)}</blockquote>

    case 'list':
      return (
        <ul class="md-list">
          {node.items.map((item) => (
            <li>{inline(item)}</li>
          ))}
        </ul>
      )

    case 'rule':
      return <hr class="md-rule" />
  }
}
