import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import {
  DeckLoadError,
  deckKey,
  findBuiltin,
  loadDeck,
  refFromParams,
  refToQuery,
  type LoadFailure,
} from './core/deck'
import { loadPrefs, loadSettings, savePrefs, saveSettings } from './core/prefs'
import {
  answer as answerCard,
  isFinished,
  loadSession,
  clearSession,
  retryWrong,
  saveSession,
  startSession,
} from './core/session'
import type { Card, DeckPrefs, DeckRef, Session, Settings } from './core/types'
import { t, useLocale } from './i18n'
import { measureAsync } from './monitoring'
import { applyTheme, watchSystemTheme } from './theme/apply'
import { Banners } from './ui/Banners'
import { DeckHome } from './ui/DeckHome'
import { Landing } from './ui/Landing'
import { Quiz } from './ui/Quiz'
import { Result } from './ui/Result'
import { SettingsSheet } from './ui/SettingsSheet'
import { ShareSheet } from './ui/ShareSheet'
import { TopBar } from './ui/TopBar'

type Stage =
  | { name: 'landing' }
  | { name: 'loading'; ref: DeckRef }
  | { name: 'error'; ref: DeckRef; reason: LoadFailure }
  | { name: 'deck'; ref: DeckRef; cards: Card[] }

/**
 * Workbox broadcasts here when a stale-while-revalidate refresh found different
 * bytes for a deck. The fresh copy is already in the cache by the time this
 * fires, so acting on it costs no extra request — it only decides when to read
 * what has already arrived.
 */
function useSourceChanged(): [boolean, () => void] {
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
  return [changed, useCallback(() => setChanged(false), [])]
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [stage, setStage] = useState<Stage>({ name: 'landing' })
  const [session, setSession] = useState<Session | null>(null)
  const [prefs, setPrefs] = useState<DeckPrefs | null>(null)
  /** False means the deck's own home screen; true means a round is under way. */
  const [studying, setStudying] = useState(false)
  /** Shown once, when changing a setting threw away a round in progress. */
  const [discardedRound, setDiscardedRound] = useState(false)
  /** Shown once, after the cards were re-read because the source moved. */
  const [justRefreshed, setJustRefreshed] = useState(false)
  const [sourceChanged, clearSourceChanged] = useSourceChanged()
  const [sheet, setSheet] = useState<'none' | 'settings' | 'share'>('none')
  /*
   * Bumped once the requested locale's strings have actually arrived. Loading
   * is async, so anything that calls t() during render — the deck title, the
   * document title — has to depend on this rather than on settings.locale, or
   * it renders once with the previous language and never corrects itself.
   */
  const [localeTick, setLocaleTick] = useState(0)

  /* ------------------------------------------------------------- chrome */

  useEffect(() => {
    applyTheme(settings.theme)
    return watchSystemTheme(() => settings.theme)
  }, [settings.theme])

  useEffect(() => {
    void useLocale(settings.locale).then(() => setLocaleTick((n) => n + 1))
  }, [settings.locale])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  /* -------------------------------------------------------------- routing */

  const openRef = useCallback(async (ref: DeckRef, push: boolean) => {
    if (push) history.pushState({}, '', refToQuery(ref))
    setStage({ name: 'loading', ref })
    setSession(null)
    setStudying(false)

    try {
      const cards = await measureAsync('deck-fetch', () => loadDeck(ref))
      const deckKeyForRef = deckKey(ref)
      setStage({ name: 'deck', ref, cards })
      // Initialised here, where the cards are already in hand, rather than in
      // an effect watching them. Watching them meant that re-reading the deck
      // after the source moved re-ran the whole open sequence and wiped the
      // very notice that said it had been re-read.
      setPrefs(loadPrefs(deckKeyForRef))
      setDiscardedRound(false)
      setJustRefreshed(false)
      // Restored, not resumed: an interrupted round is offered on the deck's
      // home screen rather than dropping the reader into a card they did not
      // ask for. Null simply means there is nothing to carry on with.
      setSession(loadSession(deckKeyForRef, cards.length))
    } catch (error) {
      const reason: LoadFailure = error instanceof DeckLoadError ? error.reason : 'network'
      setStage({ name: 'error', ref, reason })
    }
  }, [])

  const goHome = useCallback(() => {
    history.pushState({}, '', location.pathname)
    setStage({ name: 'landing' })
    setSession(null)
    setStudying(false)
  }, [])

  // Read the URL on first paint and whenever the back button moves us.
  useEffect(() => {
    const sync = () => {
      const ref = refFromParams(new URLSearchParams(location.search))
      if (ref) void openRef(ref, false)
      else setStage({ name: 'landing' })
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [openRef])

  /* -------------------------------------------------------------- session */

  const key = stage.name === 'deck' || stage.name === 'error' ? deckKey(stage.ref) : null
  const cards = stage.name === 'deck' ? stage.cards : null

  useEffect(() => {
    if (!key || !session) return
    if (isFinished(session)) clearSession(key)
    else saveSession(key, session)
  }, [key, session])

  const onAnswer = useCallback((knew: boolean) => {
    setSession((current) => (current ? answerCard(current, knew) : current))
  }, [])

  /**
   * Entering the quiz, however you got there. The deck screen's one-off notices
   * are cleared here rather than in each caller, so resuming a round dismisses
   * them just as starting a fresh one does.
   */
  const enterQuiz = useCallback(() => {
    setDiscardedRound(false)
    setJustRefreshed(false)
    setStudying(true)
  }, [])

  const beginRound = useCallback(() => {
    if (!cards || !prefs) return
    setSession(
      startSession(cards.length, {
        count: prefs.count,
        shuffle: prefs.shuffle,
        direction: prefs.direction,
      }),
    )
    enterQuiz()
  }, [cards, prefs, enterQuiz])

  const restart = beginRound

  const retryMisses = useCallback(() => {
    setSession((current) => (current ? retryWrong(current, prefs?.shuffle ?? true) : current))
  }, [prefs])

  const updatePrefs = useCallback(
    (patch: Partial<DeckPrefs>) => {
      if (!key || !prefs || !cards) return
      const next = { ...prefs, ...patch }
      setPrefs(next)
      savePrefs(key, next)
      // These settings decide how a round is built, so a round already under
      // way no longer matches them and is dropped. It used to be dropped
      // silently mid-quiz; now it can only happen from the deck's home screen,
      // and the screen says so.
      const hadRound = session != null && !isFinished(session)
      clearSession(key)
      setSession(null)
      setDiscardedRound(hadRound)
    },
    [key, prefs, session],
  )

  /* ------------------------------------------------------- source refresh */

  /**
   * Re-read the deck when the source has moved, but only from its home screen.
   * Mid-round the cards must not change underneath the reader, so the update
   * waits — which is what the banner says while it waits.
   *
   * No extra network request: the background revalidation that raised the flag
   * has already put the fresh copy in the cache, so this fetch is a cache read.
   */
  useEffect(() => {
    if (!sourceChanged || studying) return
    if (stage.name !== 'deck' || !key) return
    const ref = stage.ref
    let cancelled = false
    void (async () => {
      try {
        const fresh = await loadDeck(ref)
        if (cancelled) return
        setStage({ name: 'deck', ref, cards: fresh })
        // Re-validate the saved round against the new deck. loadSession drops
        // it when the card count no longer covers its indices; when the count
        // is unchanged the round continues, and a card whose text was edited
        // simply shows its new text.
        setSession(loadSession(key, fresh.length))
        setJustRefreshed(true)
        clearSourceChanged()
      } catch {
        // Leave the flag set: the banner keeps saying so and the next visit to
        // this screen tries again.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sourceChanged, studying, stage, key, clearSourceChanged])

  /* ---------------------------------------------------------------- title */

  const deckTitle = useMemo(() => {
    if (stage.name !== 'deck' && stage.name !== 'error' && stage.name !== 'loading') return null
    const ref = stage.ref
    if (ref.kind === 'builtin') {
      const builtin = findBuiltin(ref.id)
      return builtin ? t(builtin.titleKey) : null
    }
    // An unnamed sheet has no title of its own. Returning null lets the app
    // name stand alone, instead of rendering it twice on both sides of a dot.
    return ref.title || null
  }, [stage, localeTick])

  useEffect(() => {
    document.title = deckTitle ? `${deckTitle} · ${t('app.name')}` : t('app.name')
  }, [deckTitle, localeTick])

  /* ------------------------------------------------------------- rendering */

  const activeRef = stage.name === 'landing' ? null : stage.ref

  return (
    <>
      <TopBar
        title={deckTitle ?? t('app.name')}
        showBack={stage.name !== 'landing'}
        onBack={studying ? () => setStudying(false) : goHome}
        canShare={activeRef !== null}
        onShare={() => setSheet('share')}
        onSettings={() => setSheet('settings')}
      />

      <Banners hasDeck={stage.name === 'deck'} sourceChanged={sourceChanged && studying} />

      {stage.name === 'landing' ? (
        <Landing onOpen={(ref) => void openRef(ref, true)} />
      ) : null}

      {stage.name === 'loading' ? (
        <div class="center">
          <span class="spin" /> {t('common.loading')}
        </div>
      ) : null}

      {stage.name === 'error' ? (
        <div class="page">
          <div class="notice bad">
            <strong>{t(`error.${camel(stage.reason)}`)}</strong>
            <span>{t(`error.${camel(stage.reason)}.hint`)}</span>
          </div>
          <div class="row">
            <button class="primary" onClick={() => void openRef(stage.ref, false)}>
              {t('common.retry')}
            </button>
            <button onClick={goHome}>{t('common.home')}</button>
          </div>
        </div>
      ) : null}

      {stage.name === 'deck' && prefs ? (
        !studying ? (
          <DeckHome
            title={deckTitle ?? t('deck.untitled')}
            cardCount={stage.cards.length}
            prefs={prefs}
            session={session}
            notice={discardedRound ? 'discarded' : justRefreshed ? 'refreshed' : null}
            onStart={beginRound}
            onResume={enterQuiz}
            onRestart={beginRound}
            onPrefs={updatePrefs}
          />
        ) : session && isFinished(session) ? (
          <Result
            session={session}
            cards={stage.cards}
            onRetryWrong={retryMisses}
            onRestart={restart}
            onBackToDeck={() => setStudying(false)}
          />
        ) : session ? (
          <Quiz
            session={session}
            cards={stage.cards}
            swipeEnabled={settings.swipeEnabled}
            onAnswer={onAnswer}
          />
        ) : null
      ) : null}

      {sheet === 'settings' ? (
        <SettingsSheet
          settings={settings}
          onSettings={updateSettings}
          onClose={() => setSheet('none')}
        />
      ) : null}

      {sheet === 'share' && activeRef ? (
        <ShareSheet deckRef={activeRef} onClose={() => setSheet('none')} />
      ) : null}
    </>
  )
}

/** `not-shared` -> `notShared`, so failure reasons map straight onto i18n keys. */
function camel(reason: string): string {
  return reason.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}
