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
  name,
  label,
  value,
  onChange,
  children,
}: {
  /*
   * `name`, not `id`, and that distinction matters. Chrome's Issues panel asks
   * for one or the other so it can identify the field for autofill — the label
   * association is already correct through the wrapping <label>, which is why
   * every field here reports the right accessible name without it.
   *
   * An `id` would be the wrong answer: this component is reused, and a sheet
   * opening does not unmount the screen behind it, so two "Direction" selects
   * are in the document at once. Sharing an id between them is a duplicate id,
   * which is a real accessibility fault rather than the tidiness one being
   * fixed here. A `name` has no uniqueness requirement outside a form.
   */
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  children: ComponentChildren
}) {
  return (
    <label>
      <span class="label-text">{label}</span>
      <span class="select-wrap">
        <select
          name={name}
          value={value}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        >
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
  name,
  label,
  checked,
  onChange,
}: {
  /** See SelectField: a name, not an id, and only to identify the field. */
  name: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label class="toggle">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
      <span>{label}</span>
    </label>
  )
}
