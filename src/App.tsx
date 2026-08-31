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

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [stage, setStage] = useState<Stage>({ name: 'landing' })
  const [session, setSession] = useState<Session | null>(null)
  const [prefs, setPrefs] = useState<DeckPrefs | null>(null)
  /** False means the deck's own home screen; true means a round is under way. */
  const [studying, setStudying] = useState(false)
  /** Shown once, when changing a setting threw away a round in progress. */
  const [discardedRound, setDiscardedRound] = useState(false)
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
      setStage({ name: 'deck', ref, cards })
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
    if (!key || !cards) return
    setPrefs(loadPrefs(key))
    setDiscardedRound(false)
    setStudying(false)
    // Restored, not resumed: an interrupted round is offered on the deck's home
    // screen rather than dropping the reader back into a card they did not ask
    // for. Null simply means there is nothing to carry on with.
    setSession(loadSession(key, cards.length))
  }, [key, cards])

  useEffect(() => {
    if (!key || !session) return
    if (isFinished(session)) clearSession(key)
    else saveSession(key, session)
  }, [key, session])

  const onAnswer = useCallback((knew: boolean) => {
    setSession((current) => (current ? answerCard(current, knew) : current))
  }, [])

  const beginRound = useCallback(() => {
    if (!cards || !prefs) return
    setDiscardedRound(false)
    setSession(
      startSession(cards.length, {
        count: prefs.count,
        shuffle: prefs.shuffle,
        direction: prefs.direction,
      }),
    )
    setStudying(true)
  }, [cards, prefs])

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

      <Banners hasDeck={stage.name === 'deck'} />

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
            discardedRound={discardedRound}
            onStart={beginRound}
            onResume={() => setStudying(true)}
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
