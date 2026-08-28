import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { Icon } from './Icon'

/**
 * Three things the app owes the user but should never interrupt them for:
 * that they are offline and looking at a cached deck, that the source has
 * changed since it was loaded, and that installing keeps the deck available
 * offline. All three are notices, never modals — a round in progress is more
 * important than any of them.
 */

export function Banners({ hasDeck }: { hasDeck: boolean }) {
  const offline = useOffline()
  const sourceChanged = useSourceChanged()
  const install = useInstallPrompt()

  return (
    <>
      {offline ? <Bar icon="offline" text={t('banner.offline')} /> : null}
      {/*
       * Deliberately not applied on the spot. Swapping the cards out while
       * someone is halfway through would reshuffle the round under them, so
       * the new content waits for the next one.
       */}
      {sourceChanged && !offline ? <Bar text={t('banner.updated')} /> : null}
      {install && hasDeck && !offline ? (
        <Bar text={t('banner.install')} action={{ label: t('common.start'), onClick: install }} />
      ) : null}
    </>
  )
}

function Bar({
  text,
  icon,
  action,
}: {
  text: string
  icon?: 'offline'
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div class="banner" role="status">
      {icon ? <Icon name={icon} /> : null}
      <span class="grow">{text}</span>
      {action ? (
        <button class="quiet small" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
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

/** Workbox posts here when a stale-while-revalidate refresh found new bytes. */
function useSourceChanged(): boolean {
  const [changed, setChanged] = useState(false)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('deck-source-updated')
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (
        typeof data === 'object' &&
        data !== null &&
        (data as { type?: string }).type === 'CACHE_UPDATED'
      ) {
        setChanged(true)
      }
    }
    channel.addEventListener('message', onMessage)
    return () => {
      channel.removeEventListener('message', onMessage)
      channel.close()
    }
  }, [])
  return changed
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}

/**
 * Installing matters more here than the usual engagement nudge: on iOS, a site
 * that has not been added to the home screen has its storage cleared after
 * seven unused days, which would take the saved round with it.
 */
function useInstallPrompt(): (() => void) | null {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!deferred) return null
  return () => {
    void deferred.prompt()
    setDeferred(null)
  }
}
