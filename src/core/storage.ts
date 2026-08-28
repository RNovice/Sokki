/**
 * localStorage, defensively.
 *
 * Every read here can fail in ways that must not reach the user: Safari in
 * private mode throws on write, the quota can be full, and a value written by
 * an older build can be the wrong shape. A study app that shows a blank screen
 * because a saved round could not be parsed is worse than one that quietly
 * starts over, so every failure path ends in a fallback rather than an error.
 */

const NAMESPACE = 'sokki'

function key(name: string): string {
  return `${NAMESPACE}:${name}`
}

export function readJson<T>(name: string, guard: (value: unknown) => value is T): T | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(key(name))
  } catch {
    return null // private mode, or storage disabled entirely
  }
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!guard(parsed)) {
      remove(name) // written by an older build, or corrupted
      return null
    }
    return parsed
  } catch {
    remove(name)
    return null
  }
}

export function writeJson(name: string, value: unknown): boolean {
  try {
    localStorage.setItem(key(name), JSON.stringify(value))
    return true
  } catch {
    // Most likely the quota. Shed the oldest saved rounds and try once more —
    // an in-progress round matters more than a finished one from last week.
    if (evictOldestSessions(3)) {
      try {
        localStorage.setItem(key(name), JSON.stringify(value))
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

export function remove(name: string): void {
  try {
    localStorage.removeItem(key(name))
  } catch {
    /* nothing useful to do */
  }
}

function ourKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(`${NAMESPACE}:`))
  } catch {
    return []
  }
}

export function sessionKeys(): string[] {
  return ourKeys().filter((k) => k.startsWith(`${NAMESPACE}:session:`))
}

/** Sessions carry `startedAt`, so "oldest" is answerable without an index. */
function evictOldestSessions(howMany: number): boolean {
  const dated = sessionKeys()
    .map((k) => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(k) ?? 'null')
        const startedAt =
          typeof value === 'object' && value !== null && 'startedAt' in value
            ? Number((value as { startedAt: unknown }).startedAt)
            : 0
        return { k, startedAt: Number.isFinite(startedAt) ? startedAt : 0 }
      } catch {
        return { k, startedAt: 0 }
      }
    })
    .sort((a, b) => a.startedAt - b.startedAt)

  const doomed = dated.slice(0, howMany)
  if (doomed.length === 0) return false
  for (const { k } of doomed) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* keep going */
    }
  }
  return true
}

/** Keep at most `max` saved rounds, dropping the oldest first. */
export function capSessions(max: number): void {
  const excess = sessionKeys().length - max
  if (excess > 0) evictOldestSessions(excess)
}
