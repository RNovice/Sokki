import type { ComponentChildren } from 'preact'
import { Icon } from './Icon'

/**
 * A labelled select.
 *
 * The trigger is ours and the popup is the browser's, which is the only split
 * that holds up everywhere: the element itself takes any styling, while the
 * list of options is drawn by the operating system and ignores nearly all of
 * it. Styling the trigger and leaving the menu native is therefore not a
 * compromise — it is the combination that behaves the same on every platform,
 * and the one that inherits the platform's own keyboard and accessibility
 * behaviour for free.
 */
export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ComponentChildren
}) {
  return (
    <label>
      <span class="label-text">{label}</span>
      <span class="select-wrap">
        <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
          {children}
        </select>
        {/* Drawn by us because `appearance: none` removes the platform's own
            arrow. `pointer-events: none` keeps the click going to the select
            underneath, so the arrow still opens the menu. */}
        <Icon name="chevron" class="select-chevron" />
      </span>
    </label>
  )
}

/** A checkbox with its label beside it, on one line. */
export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label class="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
      <span>{label}</span>
    </label>
  )
}
