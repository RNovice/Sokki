/**
 * Icons, as hand-written inline SVG.
 *
 * The two properties that make these hard to break are `currentColor` and
 * sizing in `em`:
 *
 *   - `currentColor` means an icon takes the colour of whatever text it sits
 *     in. All ten themes are handled with no per-theme work, and a theme added
 *     later needs none either.
 *   - `1em` means an icon scales with its surrounding font size, so a type
 *     change can never leave an icon the wrong size next to its label.
 *
 * Deliberately not an icon font: those fail in exactly the ways that matter
 * here — a blank box until the font loads, the whole set gone if the request
 * fails, no offline guarantee, and sizing that ignores the text around it.
 * Deliberately not emoji either: they cannot be coloured to match a theme and
 * render differently on every platform.
 *
 * There is no runtime dependency and no build step. Each icon is a few hundred
 * bytes, and a name that does not exist is a compile error rather than an empty
 * square in the interface.
 */

import type { JSX } from 'preact'

export type IconName =
  | 'back'
  | 'close'
  | 'settings'
  | 'share'
  | 'chevron'
  | 'check'
  | 'cross'
  | 'flip'
  | 'offline'
  | 'pencil'
  | 'trash'

interface Props extends Omit<JSX.SVGAttributes<SVGSVGElement>, 'size'> {
  name: IconName
  /** Multiplier on the surrounding font size. */
  size?: number
}

/**
 * All paths are drawn on a 24×24 grid with a 2px stroke and no fill, so they
 * share a single optical weight. Mixing filled and stroked icons is the usual
 * way a hand-rolled set starts to look inconsistent.
 */
const PATHS: Record<IconName, JSX.Element> = {
  back: <path d="M15 5 8 12l7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  settings: (
    <>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  share: (
    <>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3M8 7l4-4 4 4" />
    </>
  ),
  chevron: <path d="M9 5l7 7-7 7" />,
  check: <path d="M4 12.5l5.5 5.5L20 7" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  flip: (
    <>
      <path d="M3 8a5 5 0 0 1 5-5h9" />
      <path d="M14 1l3 2-3 2" />
      <path d="M21 16a5 5 0 0 1-5 5H7" />
      <path d="M10 23l-3-2 3-2" />
    </>
  ),
  offline: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3.5-2.3M19 13a10 10 0 0 0-6.5-2.9" />
      <circle cx="12" cy="20" r="0.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </>
  ),
  // Lucide's trash-2, which is drawn to the same rules as the rest of this set
  // — 24 grid, 2px stroke, no fill — so it needed no adjusting to sit beside
  // them.
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
}

export function Icon({ name, size = 1, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={`${size}em`}
      height={`${size}em`}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      // Decorative by default: every icon in this app sits beside a text label
      // or inside a button that already carries an aria-label, so announcing
      // them again would only add noise for a screen reader.
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
