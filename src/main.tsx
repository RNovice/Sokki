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
 * markup to match what the component would produce, and it cannot, because the
 * shell is always zh-Hant while the app renders in the reader's own language.
 *
 * Clearing costs nothing that matters. The paint it was there for has already
 * happened, and the removal and the first render are in the same task, so the
 * browser only ever composites the result.
 */
root.replaceChildren()
render(<App />, root)
