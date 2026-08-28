import { render } from 'preact'
import { App } from './App'
import { startMonitoring } from './monitoring'
import './ui/styles.css'

startMonitoring()

const root = document.getElementById('app')
if (!root) throw new Error('#app missing from index.html')

render(<App />, root)
