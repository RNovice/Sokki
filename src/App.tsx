import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import {
  DeckLoadError,
  deckKey,
  findBuiltin,
  loadDeck,
  markdownFromParams,
  refFromParams,
  refToQuery,
  type LoadFailure,
} from './core/deck'
import { loadPrefs, loadSettings, savePrefs, saveSettings } from './core/prefs'
import {
  clearRecent,
  loadRecent,
  rememberDeck,
  renameRecent,
  type RecentDeck,
} from './core/recent'
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
import { t, loadLocale } from './i18n'
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
  /** Shown once, after the cards were re-read because the source moved. */
  const [justRefreshed, setJustRefreshed] = useState(false)
  const [sourceChanged, clearSourceChanged] = useSourceChanged()
  const [sheet, setSheet] = useState<'none' | 'settings' | 'share'>('none')
  /*
   * Held here rather than read inside Landing, so that clearing the history
   * from the settings sheet — which sits over the landing page without
   * remounting it — takes effect on the list behind it straight away.
   */
  const [recent, setRecent] = useState<RecentDeck[]>(() => loadRecent())
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
    void loadLocale(settings.locale).then(() => setLocaleTick((n) => n + 1))
  }, [settings.locale])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  /* -------------------------------------------------------------- routing */

  const openRef = useCallback(async (ref: DeckRef, push: boolean, markdown?: boolean) => {
    const deckKeyForRef = deckKey(ref)
    /*
     * A link that names the Markdown setting overrides what is stored, because
     * whoever shared it wrote the content and knows how it is meant to be read.
     * A link that says nothing leaves the reader's own choice for this deck
     * alone — which is why the parameter is optional rather than a boolean.
     */
    const opening =
      markdown === undefined ? loadPrefs(deckKeyForRef) : { ...loadPrefs(deckKeyForRef), markdown }
    if (markdown !== undefined) savePrefs(deckKeyForRef, opening)

    if (push) history.pushState({}, '', refToQuery(ref, opening.markdown))
    setStage({ name: 'loading', ref })
    setSession(null)
    setStudying(false)

    try {
      const cards = await measureAsync('deck-fetch', () => loadDeck(ref))
      setStage({ name: 'deck', ref, cards })
      // Recorded only once the sheet has actually answered with cards, so a
      // dead or unshared link never takes a slot. Recorded under the name we
      // know it by, which is your own if you have given it one.
      setRecent(
        rememberDeck(
          ref.kind === 'sheet' ? { ...ref, title: opening.name || ref.title } : ref,
          cards.length,
        ),
      )
      // Initialised here, where the cards are already in hand, rather than in
      // an effect watching them. Watching them meant that re-reading the deck
      // after the source moved re-ran the whole open sequence and wiped the
      // very notice that said it had been re-read.
      setPrefs(opening)
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
      const params = new URLSearchParams(location.search)
      const ref = refFromParams(params)
      if (ref) void openRef(ref, false, markdownFromParams(params))
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
      /*
       * Markdown is the one preference the URL carries, so the address bar is
       * kept honest about it — and copying the address bar then shares what is
       * actually on screen. Replaced rather than pushed: changing how the text
       * is drawn is not a place the back button should return to.
       */
      if (stage.name !== 'landing' && next.markdown !== prefs.markdown) {
        history.replaceState({}, '', refToQuery(stage.ref, next.markdown))
      }
      // The recent list keeps its own copy of the name so it can be shown
      // without loading every deck, so a rename has to reach it too.
      if (stage.name !== 'landing' && next.name !== prefs.name) {
        setRecent(renameRecent(stage.ref, next.name ?? ''))
      }
      // The round in progress is left alone. It carries its own direction, and
      // its size and order were fixed when it was built, so it does not depend
      // on these values at all — the round used to be thrown away here to keep
      // it "consistent" with settings it never read. The deck screen points out
      // when the two differ; the next round picks the new values up.
    },
    [key, prefs, cards, stage],
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
    // Yours first, then whatever the link called it. An unnamed sheet has no
    // title at all; returning null lets the app name stand alone, instead of
    // rendering it twice on both sides of a dot.
    return prefs?.name || ref.title || null
    // localeTick looks unused to a linter and is not: t() reads a module-level
    // dictionary that is swapped in asynchronously, so the only thing telling
    // this memo that its output changed is the tick.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, prefs, localeTick])

  useEffect(() => {
    /*
     * With no deck open this is a sentence, not just the app's name. It is the
     * strongest on-page signal a crawler reads, and "Sokki" alone says nothing
     * about what the page is for. index.html ships the same string so that a
     * reader on the default locale never sees the tab change.
     */
    document.title = deckTitle ? `${deckTitle} · ${t('app.name')}` : t('app.title')
  }, [deckTitle, localeTick])

  /* ------------------------------------------------------------- rendering */

  const activeRef = stage.name === 'landing' ? null : stage.ref

  /*
   * The chrome, held across renders.
   *
   * Opening a sheet is a state change on App, so without this it re-renders
   * everything App renders — the bar, the banners, the page and the card —
   * none of which has changed. Measured: five component renders on open and
   * five more on close, plus the bar's three icons each time.
   *
   * The inline handlers being rebuilt inside the memo is not a problem: what
   * Preact compares is the element, and while these dependencies hold it is
   * the same object, which is what makes it skip the subtree.
   */
  const chrome = useMemo(
    () => (
      <>
        <TopBar
          title={deckTitle ?? t('app.name')}
          showBack={stage.name !== 'landing'}
          onBack={studying ? () => setStudying(false) : goHome}
          canShare={activeRef !== null}
          onShare={() => setSheet('share')}
          onSettings={() => setSheet('settings')}
        />
        <Banners sourceChanged={sourceChanged && studying} />
      </>
    ),
    // localeTick again: the bar's labels come from t(), which reads a module
    // dictionary swapped in asynchronously. See the deck title above.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [deckTitle, stage.name, studying, activeRef, goHome, sourceChanged, localeTick],
  )

  /*
   * The page under the chrome, held for the same reason. A sheet opening or
   * closing must not re-render the card being studied.
   */
  const body = useMemo(
    () => (
      <>
          {stage.name === 'landing' ? (
            <Landing
              recent={recent}
              onOpen={(ref, markdown) => void openRef(ref, true, markdown)}
            />
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
                canRename={stage.ref.kind === 'sheet'}
                name={deckTitle ?? ''}
                onRename={(name) => updatePrefs({ name: name || undefined })}
                cardCount={stage.cards.length}
                prefs={prefs}
                session={session}
                justRefreshed={justRefreshed}
                onStart={beginRound}
                onResume={enterQuiz}
                onRestart={beginRound}
                onPrefs={updatePrefs}
              />
            ) : session && isFinished(session) ? (
              <Result
                session={session}
                cards={stage.cards}
                markdown={prefs.markdown}
                onRetryWrong={retryMisses}
                onRestart={restart}
                onBackToDeck={() => setStudying(false)}
              />
            ) : session ? (
              <Quiz
                session={session}
                cards={stage.cards}
                markdown={prefs.markdown}
                swipeEnabled={settings.swipeEnabled}
                onAnswer={onAnswer}
              />
            ) : null
          ) : null}
      </>
    ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      stage,
      prefs,
      session,
      studying,
      justRefreshed,
      recent,
      deckTitle,
      settings.swipeEnabled,
      openRef,
      goHome,
      updatePrefs,
      beginRound,
      enterQuiz,
      retryMisses,
      restart,
      onAnswer,
      localeTick,
    ],
  )

  return (
    <>
      {chrome}

      {body}

      {sheet === 'settings' ? (
        <SettingsSheet
          settings={settings}
          onSettings={updateSettings}
          hasRecent={recent.length > 0}
          onClearRecent={() => {
            clearRecent()
            setRecent([])
          }}
          onClose={() => setSheet('none')}
        />
      ) : null}

      {sheet === 'share' && activeRef ? (
        <ShareSheet
          deckRef={activeRef}
          name={deckTitle ?? ''}
          markdown={prefs?.markdown ?? false}
          onClose={() => setSheet('none')}
        />
      ) : null}
    </>
  )
}

/** `not-shared` -> `notShared`, so failure reasons map straight onto i18n keys. */
function camel(reason: string): string {
  return reason.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}
