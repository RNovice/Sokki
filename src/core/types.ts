/**
 * The whole domain model. It is this small on purpose.
 *
 * Nothing here is a record of what the user knows. A card is two strings read
 * from a spreadsheet we never write to, and a session is a shuffled list of
 * indices that expires in a day. There is no profile, no history, no identity —
 * which is why there is also no account, no sync, and nothing to lose.
 */

/** One row of the source. Column A and column B, nothing else. */
export interface Card {
  front: string
  back: string
}

/**
 * Where a deck comes from. Both kinds are addressable by URL, which is what
 * makes every deck shareable — there is no local-only source to special-case.
 */
export type DeckRef =
  | { kind: 'sheet'; sheetId: string; gid: string; title?: string | undefined }
  | { kind: 'builtin'; id: string }

/** Which side of the card is the question. */
export type Direction = 'front-back' | 'back-front' | 'mixed'

export type Locale = 'zh-Hant' | 'en' | 'ja'

export type ThemeName =
  | 'light'
  | 'dark'
  | 'sepia'
  | 'forest'
  | 'ocean'
  | 'plum'
  | 'sand'
  | 'slate'
  | 'rose'
  | 'mono'

/** Global, and genuinely global: nobody changes language per deck. */
export interface Settings {
  locale: Locale
  theme: ThemeName | 'system'
  /** Swipe is an accelerator. The buttons never go away — see ui/Quiz. */
  swipeEnabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'zh-Hant',
  theme: 'system',
  swipeEnabled: true,
}

/** Per deck, because 日→中 and 中→日 are different exercises. */
export interface DeckPrefs {
  direction: Direction
  /** How many cards this round. 0 means every card in the deck. */
  count: number
  shuffle: boolean
}

export const DEFAULT_PREFS: DeckPrefs = {
  direction: 'front-back',
  count: 0,
  shuffle: true,
}

/**
 * A round in progress. Indices point into the deck's card array, so this stays
 * small enough for localStorage even for a deck of a few thousand cards.
 */
export interface Session {
  v: 1
  /** The cards for this round, already shuffled and already trimmed to count. */
  order: number[]
  /** How far through `order` we are. Equals order.length when finished. */
  pos: number
  /** Indices the user did not know, in the order they came up. */
  wrong: number[]
  /** Answered correctly without having been marked wrong earlier this round. */
  firstTryCorrect: number
  startedAt: number
  direction: Direction
  /**
   * Whether this round's order was shuffled. Optional so that a round saved by
   * a build before this field existed still loads; absent is read as shuffled,
   * which is the default and so usually right.
   *
   * Stored rather than inferred: an order that happens to come out ascending is
   * indistinguishable from one that was never shuffled, and guessing would put
   * a wrong note on a short round.
   */
  shuffle?: boolean
}
