import { beforeEach, describe, expect, it } from 'vitest'
import { loadPrefs, loadSettings, savePrefs, saveSettings } from './prefs'
import { DEFAULT_PREFS } from './types'

beforeEach(() => localStorage.clear())

/**
 * Themes get removed. When one does, the reader who was using it must lose the
 * palette and nothing else — this is the file where "nothing else" is enforced,
 * because the failure is silent: their language and swipe setting would simply
 * be back at the defaults one day with no error anywhere.
 */
describe('a theme that no longer exists', () => {
  it('resolves to "match system" and takes nothing with it', () => {
    localStorage.setItem(
      'sokki:settings',
      JSON.stringify({ locale: 'ja', theme: 'forest', swipeEnabled: false }),
    )
    expect(loadSettings()).toEqual({ locale: 'ja', theme: 'system', swipeEnabled: false })
  })

  it('leaves a theme that does exist alone', () => {
    saveSettings({ locale: 'en', theme: 'dracula', swipeEnabled: true })
    expect(loadSettings().theme).toBe('dracula')
  })

  it('still falls back completely when the record itself is unusable', () => {
    // A wrong-shaped record is a different case from a retired theme: there is
    // nothing in it worth keeping.
    for (const junk of ['not json', '{}', '{"locale":"xx","theme":"dark","swipeEnabled":true}']) {
      localStorage.setItem('sokki:settings', junk)
      expect(loadSettings().theme).toBe('system')
      expect(loadSettings().swipeEnabled).toBe(true)
    }
  })
})

describe('deck preferences', () => {
  it('fill in fields added since the record was written', () => {
    // Written by a build before `markdown` and `name` existed. The type says
    // markdown is a boolean, so it has to be one.
    localStorage.setItem(
      'sokki:prefs:sheet:abc:0',
      JSON.stringify({ direction: 'back-front', count: 20, shuffle: false }),
    )
    expect(loadPrefs('sheet:abc:0')).toEqual({
      ...DEFAULT_PREFS,
      direction: 'back-front',
      count: 20,
      shuffle: false,
    })
  })

  it('round-trip', () => {
    savePrefs('k', { ...DEFAULT_PREFS, markdown: true, name: 'N5' })
    expect(loadPrefs('k')).toMatchObject({ markdown: true, name: 'N5' })
  })

  it('are the defaults when there is nothing saved', () => {
    expect(loadPrefs('never-seen')).toEqual(DEFAULT_PREFS)
  })
})
