/**
 * Monitoring, within the promise the app makes.
 *
 * The product's one hard rule is that we keep nothing about the person using
 * it. That rules out Google Analytics, which needs a persistent client id to
 * function at all — and which costs 146 KB gzipped, more than twice the budget
 * for the entire app, to measure performance it would itself degrade.
 *
 * Cloudflare Web Analytics sets no cookie and no identifier, so it needs no
 * consent banner and contradicts nothing. Everything reported from here is
 * about the code: timings, and the fact that an error happened. Never a card,
 * never a spreadsheet id, never a URL that contains one.
 *
 * Core Web Vitals are deliberately *not* measured here. Cloudflare's beacon
 * already collects LCP, INP and CLS, with the element selector attached, which
 * is more than the `web-vitals` package was reporting — and that package was
 * being downloaded, 3.1 KB gzipped, to feed a function that discarded every
 * value because no telemetry endpoint is configured. Two sources for one number
 * is one too many, and this was the one that cost bytes.
 */

/** Beyond these, a measurement is worth sending. Under them it is noise. */
const THRESHOLDS = {
  'deck-fetch': 1500,
  'deck-parse': 1000,
  'session-build': 200,
  'card-advance': 50,
} as const

export type MarkName = keyof typeof THRESHOLDS

interface Beacon {
  writeDataPoint?: (event: Record<string, unknown>) => void
}

declare global {
  interface Window {
    __cfBeacon?: Beacon
  }
}

let enabled = false
const reportedErrors = new Set<string>()

export function startMonitoring(): void {
  if (enabled) return
  enabled = true
  watchErrors()
}

/**
 * Cloudflare's beacon has no public custom-event API, so anything beyond the
 * page view it collects automatically goes out as a same-origin `sendBeacon`
 * that the Workers deployment can log. With no endpoint configured this is a
 * no-op, which is the correct behaviour for local development.
 */
function report(kind: string, fields: Record<string, string | number>): void {
  const endpoint = import.meta.env.VITE_TELEMETRY_ENDPOINT
  if (!endpoint) return
  try {
    const body = JSON.stringify({ kind, ...fields })
    navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))
  } catch {
    /* telemetry must never break the app */
  }
}

/* ------------------------------------------------------------------- errors */

function watchErrors(): void {
  window.addEventListener('error', (event) => {
    reportError(event.message, event.filename, event.lineno)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    reportError(reason instanceof Error ? reason.message : String(reason))
  })
}

/**
 * One report per distinct message per session. A failure inside a render loop
 * would otherwise fire hundreds of times and tell us nothing extra.
 */
function reportError(message: string, source?: string, line?: number): void {
  const key = `${message}|${source ?? ''}|${line ?? ''}`
  if (reportedErrors.has(key)) return
  reportedErrors.add(key)
  report('error', {
    // Truncated because a message can carry interpolated values, and the whole
    // point is to learn that something broke, not what the user was studying.
    message: message.slice(0, 200),
    source: (source ?? '').slice(0, 120),
    line: line ?? 0,
  })
}

/* -------------------------------------------------------- app-level timings */

/**
 * Core Web Vitals cannot see the things this app is actually slow at: parsing
 * a few thousand rows, building a round, the delay between rating a card and
 * seeing the next one. Those are measured here and reported only when they
 * exceed the budget, so a healthy session is silent.
 */
export function measure<T>(name: MarkName, work: () => T): T {
  const start = performance.now()
  try {
    return work()
  } finally {
    finish(name, performance.now() - start)
  }
}

export async function measureAsync<T>(name: MarkName, work: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await work()
  } finally {
    finish(name, performance.now() - start)
  }
}

function finish(name: MarkName, duration: number): void {
  if (duration <= THRESHOLDS[name]) return
  report('slow', { name, ms: Math.round(duration) })
}
