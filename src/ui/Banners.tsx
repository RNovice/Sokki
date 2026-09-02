import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { Icon } from './Icon'

/**
 * Two things the app owes the user but should never interrupt them for: that
 * they are offline and looking at a cached deck, and that the source has
 * changed since it was loaded. Both are notices, never modals — a round in
 * progress is more important than either of them.
 *
 * There is no install prompt. Installing is worth something here, but a bar
 * asking for it appears on the screen where somebody has just arrived from a
 * shared link to study — the one moment they are least interested in adopting
 * the app. The browser's own install control says the same thing without
 * spending a row of the interface on it.
 */

/**
 * `sourceChanged` is owned by App, not detected here: knowing the source moved
 * is only half of it — something has to re-read the cards, and only App knows
 * whether a round is under way and therefore whether now is a safe moment.
 */
export function Banners({ sourceChanged }: { sourceChanged: boolean }) {
  const offline = useOffline()

  return (
    <>
      {offline ? <Bar icon="offline" text={t('banner.offline')} /> : null}
      {/*
       * Only shown while a round is under way. On the deck's own screen the
       * update is applied instead of announced — swapping cards out mid-round
       * would reshuffle it under the reader, so there it waits.
       */}
      {sourceChanged && !offline ? <Bar text={t('banner.updated')} /> : null}
    </>
  )
}

function Bar({ text, icon }: { text: string; icon?: 'offline' }) {
  return (
    <div class="banner" role="status">
      {icon ? <Icon name={icon} /> : null}
      <span class="grow">{text}</span>
    </div>
  )
}

function useOffline(): boolean {
  const [offline, setOffline] = useState(() => navigator.onLine === false)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return offline
}
