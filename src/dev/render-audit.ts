/**
 * Counting component renders, without React DevTools.
 *
 * Preact exposes the same internal hooks the devtools bridge uses, on the
 * `options` object it exports. Assigning to one of them installs a callback
 * that Preact invokes at that point in every diff — which is all the devtools
 * extension is doing, minus the UI.
 *
 * The names are the catch. Preact's published build is mangled, and the hooks
 * are private properties, so `options._render` in the source is `options.__r`
 * in anything shipped. Which one is present depends on how the bundler
 * resolved preact, so both are wired up and whichever exists wins:
 *
 *     _diff  → __b   before a vnode is diffed
 *     _render → __r  before a *component* renders   ← what we count
 *     diffed  → diffed (not mangled)
 *     _commit → __c
 *     unmount → unmount (not mangled)
 *
 * Loaded only under `import.meta.env.DEV`, from a dynamic import in main.tsx,
 * so Vite drops the whole file out of a production build. Verify with
 * `npm run budget` — the initial JS figure must not move.
 *
 * Usage, from the browser console:
 *
 *     __renders.reset()          before the interaction you want to measure
 *     …do the thing…
 *     __renders.report()         a table, busiest component first
 *     __renders.highlight()      draw a box around whatever just re-rendered
 *
 * `highlight` is the react-scan idea, which does not work here: react-scan
 * reads React's fiber tree, and uses Preact only to build its own interface.
 * Preact's equivalent is its own devtools extension. This is neither, and the
 * reason to have it is that it needs no extension at all — so it runs on a real
 * phone over the network, which is the only place the drag path is worth
 * looking at.
 *
 * Two things to know about what it shows.
 *
 * It boxes every component render, mounts included, not only re-renders. The
 * count in the label is what separates them: a `×1` is something appearing, a
 * `×40` is something redrawing on every frame.
 *
 * It cannot inflate its own numbers. The canvas is created with
 * `document.createElement` and appended to `<body>`, outside `#app`, so Preact
 * never sees it and drawing can never provoke a render. Verified rather than
 * assumed: the same drag counts `Quiz 38, FlipCard 38, CardText 76, Icon 152`
 * with the overlay off, on, and off again.
 *
 * What it does distort is *timing*. Every boxed render calls
 * getBoundingClientRect, which forces a synchronous layout, so the app is
 * slower while the overlay is on. Read counts from it; measure durations with
 * it off.
 */

/*
 * Underscore-prefixed names are the subject of this file, not an accident:
 * every one of them is a Preact internal that the devtools bridge reads too.
 */
/* oxlint-disable no-underscore-dangle */

import { Fragment, options } from 'preact'
import type { VNode } from 'preact'

type Hook = (vnode: VNode) => void
/** Preact's private hooks, under both the source and the mangled name. */
interface Hooks {
  _render?: Hook
  __r?: Hook
  unmount?: Hook
  diffed?: Hook
}

const renders = new Map<string, number>()
const mounts = new Map<string, number>()
const unmounts = new Map<string, number>()
/** `Child <- Parent` -> how many times, so a render can be traced upwards. */
const byParent = new Map<string, number>()
/**
 * Renders where the vnode object was the *same* one as last time. Preact bails
 * out of those, so a nonzero count here means a hoisted or memoised element is
 * working; a zero next to a large render count means it is not.
 */
const reused = new Map<string, number>()

function nameOf(vnode: VNode): string {
  const type = vnode.type as unknown
  /*
   * Fragment first, by identity. Preact's published build is minified, so its
   * own `Fragment` reports its name as `S` — which shows up in every table for
   * every `<>…</>` in the app and looks like a component nobody wrote.
   */
  if (type === Fragment) return '<>'
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName || fn.name || 'anonymous'
  }
  return typeof type === 'string' ? `<${type}>` : 'unknown'
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/** Chain rather than replace: something else may already be listening. */
function install(key: keyof Hooks, listener: Hook): void {
  const host = options as unknown as Hooks
  const previous = host[key]
  host[key] = (vnode: VNode) => {
    listener(vnode)
    previous?.(vnode)
  }
}

const seen = new WeakSet<object>()

/** The nearest ancestor that is one of our components, for attribution. */
function parentOf(vnode: VNode): string {
  let node = (vnode as unknown as { _parent?: VNode; __?: VNode })
  for (let hops = 0; hops < 40; hops++) {
    const next = node._parent ?? node.__
    if (!next) return '(root)'
    if (typeof next.type === 'function') return nameOf(next)
    node = next as unknown as { _parent?: VNode; __?: VNode }
  }
  return '(deep)'
}

const lastVNode = new Map<string, unknown>()

const onRender: Hook = (vnode) => {
  // Only components. Host elements are diffed constantly and counting them
  // says nothing about which of *our* code ran.
  if (typeof vnode.type !== 'function') return
  const name = nameOf(vnode)
  bump(renders, name)
  bump(byParent, `${name} <- ${parentOf(vnode)}`)
  if (lastVNode.get(name) === vnode) bump(reused, name)
  lastVNode.set(name, vnode)
  const component = (vnode as unknown as { __c?: object; _component?: object })
  const instance = component.__c ?? component._component
  if (instance && !seen.has(instance)) {
    seen.add(instance)
    bump(mounts, name)
  }
}

const onUnmount: Hook = (vnode) => {
  if (typeof vnode.type === 'function') bump(unmounts, nameOf(vnode))
}

install('_render', onRender)
install('__r', onRender)
install('unmount', onUnmount)

export interface RenderReport {
  component: string
  renders: number
  mounts: number
  unmounts: number
  /** Renders that were not a first paint — the ones worth looking at. */
  rerenders: number
  /** Of those, how many were handed the identical vnode object. */
  sameVNode: number
}

function collect(): RenderReport[] {
  return [...renders.keys()]
    .map((component) => {
      const total = renders.get(component) ?? 0
      const mounted = mounts.get(component) ?? 0
      return {
        component,
        renders: total,
        mounts: mounted,
        unmounts: unmounts.get(component) ?? 0,
        rerenders: total - mounted,
        sameVNode: reused.get(component) ?? 0,
      }
    })
    .sort((a, b) => b.renders - a.renders)
}

/* --------------------------------------------------------------- highlight */

/**
 * The DOM node a component rendered into. `base` is a component instance's own
 * pointer at it and survives minification, unlike the vnode's `_dom`, which is
 * mangled to a name that differs between builds.
 */
function domOf(vnode: VNode): Element | null {
  const holder = vnode as unknown as { __c?: { base?: unknown }; _component?: { base?: unknown } }
  const base = (holder.__c ?? holder._component)?.base
  return base instanceof Element ? base : null
}

interface Flash {
  rect: DOMRect
  label: string
  /** How many times this component has rendered since the overlay went on. */
  count: number
  at: number
}

const FLASH_MS = 400
let canvas: HTMLCanvasElement | null = null
let flashes: Flash[] = []
const hotness = new Map<string, number>()

function paint(): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = devicePixelRatio || 1
  if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    canvas.style.width = `${innerWidth}px`
    canvas.style.height = `${innerHeight}px`
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, innerWidth, innerHeight)

  const now = performance.now()
  flashes = flashes.filter((f) => now - f.at < FLASH_MS)
  for (const f of flashes) {
    const life = 1 - (now - f.at) / FLASH_MS
    // Cold to hot, the way a profiler colours a flame graph: a component that
    // rendered once is blue, one rendering every frame is red.
    const heat = Math.min(1, f.count / 30)
    const hue = 210 - heat * 210
    ctx.strokeStyle = `hsl(${hue} 90% 55% / ${life})`
    ctx.lineWidth = 2
    ctx.strokeRect(f.rect.x, f.rect.y, f.rect.width, f.rect.height)
    ctx.fillStyle = `hsl(${hue} 90% 55% / ${life})`
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(`${f.label} ×${f.count}`, f.rect.x + 3, f.rect.y + 11)
  }
  if (canvas) requestAnimationFrame(paint)
}

const onHighlight: Hook = (vnode) => {
  if (!canvas || typeof vnode.type !== 'function') return
  const node = domOf(vnode)
  if (!node) return
  const rect = node.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return
  const label = nameOf(vnode)
  const count = (hotness.get(label) ?? 0) + 1
  hotness.set(label, count)
  flashes.push({ rect, label, count, at: performance.now() })
}

install('diffed', onHighlight)

const api = {
  reset(): void {
    renders.clear()
    mounts.clear()
    unmounts.clear()
    byParent.clear()
    reused.clear()
    lastVNode.clear()
    hotness.clear()
  },
  /** Which parent each render came from, busiest first. */
  parents(): { path: string; renders: number }[] {
    return [...byParent.entries()]
      .map(([path, count]) => ({ path, renders: count }))
      .sort((a, b) => b.renders - a.renders)
  },
  collect,
  report(): void {
    // eslint-disable-next-line no-console
    console.table(collect())
  },
  /** Toggle the overlay. Blue rendered once, red rendering every frame. */
  highlight(on = !canvas): boolean {
    if (!on) {
      canvas?.remove()
      canvas = null
      flashes = []
      return false
    }
    canvas = document.createElement('canvas')
    canvas.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    document.body.appendChild(canvas)
    hotness.clear()
    requestAnimationFrame(paint)
    return true
  },
}

declare global {
  interface Window {
    __renders: typeof api
  }
}

window.__renders = api
// eslint-disable-next-line no-console
console.info('[render-audit] __renders.reset() / .report() / .highlight()')
