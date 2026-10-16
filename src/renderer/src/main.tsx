import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import './styles/app.css'

import { createRoot } from 'react-dom/client'
import App from './App'

// Send errors from the window to the log file, so they show up in the logs folder.
let reported = 0
const report = (text: string): void => {
  if (reported++ < 20) window.api.logError(text)
}
window.addEventListener('error', (e) => report(`${e.message} (${e.filename}:${e.lineno})`))
window.addEventListener('unhandledrejection', (e) => report('Unhandled rejection: ' + String(e.reason?.stack ?? e.reason)))

// No StrictMode: the player connects a video element to the Web Audio graph, which can only happen once.
createRoot(document.getElementById('root')!).render(<App />)
