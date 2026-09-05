import { render } from 'preact'
import { App } from './App'
import { startMonitoring } from './monitoring'
import './ui/styles.css'

startMonitoring()

/*
 * Render counting, for development only. The dynamic import behind
 * `import.meta.env.DEV` is what keeps it out of the production bundle — Vite
 * resolves the constant at build time and drops the branch, so the chunk is
 * never emitted. See src/dev/render-audit.ts.
 */
if (import.meta.env.DEV) void import('./dev/render-audit')

const root = document.getElementById('app')
if (!root) throw new Error('#app missing from index.html')

/*
 * index.html ships a static copy of the landing page inside #app, so that the
 * first paint does not wait for this bundle — see `landingShell` in
 * vite.config.ts. It is emptied rather than hydrated: hydration needs the
 * markup to match what the components would produce, and it does not. The
 * shell is a hand-written mirror of ui/Landing and ui/TopBar — no icon in the
 * bar's button, no recent row, chevrons written out as raw SVG — built for the
 * crawler and the first paint rather than for a diff.
 *
 * The language is not the reason, though it was once given as one. The shell
 * is English and English is what the app renders first, so those two agree;
 * it is the structure that does not.
 *
 * Clearing costs nothing that matters. The paint it was there for has already
 * happened, and the removal and the first render are in the same task, so the
 * browser only ever composites the result.
 */
root.replaceChildren()
render(<App />, root)
