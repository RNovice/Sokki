/**
 * An in-memory Web Storage, installed for tests.
 *
 * Node exposes a `localStorage` global that is not a usable Storage, and jsdom
 * would cost seconds of startup to supply a DOM these tests never touch. This
 * is the smallest thing that behaves like the real object, including throwing
 * on quota, which storage.ts is written to survive.
 */

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }
  clear(): void {
    this.data.clear()
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
  [name: string]: unknown
}

function install(name: 'localStorage' | 'sessionStorage'): void {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, name, {
    value: storage,
    writable: true,
    configurable: true,
  })
}

install('localStorage')
install('sessionStorage')

// storage.ts enumerates our keys with Object.keys(localStorage), which needs
// the entries to be visible as own properties the way a real Storage exposes
// them. A Proxy keeps that behaviour without reimplementing all of Storage.
const raw = globalThis.localStorage
globalThis.localStorage = new Proxy(raw, {
  ownKeys(target) {
    const keys: string[] = []
    for (let i = 0; i < target.length; i++) {
      const key = target.key(i)
      if (key !== null) keys.push(key)
    }
    return keys
  },
  getOwnPropertyDescriptor(target, prop) {
    if (typeof prop === 'string' && target.getItem(prop) !== null) {
      return { enumerable: true, configurable: true, value: target.getItem(prop) }
    }
    return Reflect.getOwnPropertyDescriptor(target, prop)
  },
}) as Storage

export {}
