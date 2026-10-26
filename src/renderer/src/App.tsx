import { useEffect } from 'react'
import { ConfirmDialog, Toasts } from './components/Overlays'
import { Library } from './components/Library'
import { Player } from './components/Player'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { useHotkeys } from './lib/hotkeys'
import { resolveMotion } from '@shared/uiPrefs'
import { useApp, useSettings } from './lib/store'

export default function App(): React.JSX.Element {
  const ready = useApp((s) => s.ready)
  const view = useApp((s) => s.view)
  const init = useApp((s) => s.init)
  useHotkeys()

  // Animations: the mode, and the speed as a multiplier on the animation tokens in the styles.
  const { animations, animationSpeed, settingsView } = useSettings()
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = (): void => {
      const m = resolveMotion(animations, animationSpeed, query.matches)
      const root = document.documentElement
      root.dataset.anim = m.off ? 'off' : 'on'
      root.style.setProperty('--anim-scale', String(m.scale))
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [animations, animationSpeed])

  useEffect(() => {
    void init()
  }, [init])

  // Lets the styles know which platform this is (macOS keeps its own window buttons).
  const platform = useApp((s) => s.appInfo.platform)
  useEffect(() => {
    if (platform) document.documentElement.dataset.platform = platform
  }, [platform])

  if (!ready) {
    return (
      <div className="empty" style={{ height: '100%' }}>
        <div className="titlebar-fill" />
        <span>Loading your library…</span>
      </div>
    )
  }

  return (
    <div className="app">
      {view === 'player' ? (
        <Player />
      ) : view === 'settings' && settingsView === 'page' ? (
        <Settings />
      ) : (
        <>
          <TopBar />
          <div className="app-body">
            <Sidebar />
            <Library />
          </div>
        </>
      )}
      {view === 'settings' && settingsView === 'window' && <Settings modal />}
      <StatusBar />
      <ConfirmDialog />
      <Toasts />
    </div>
  )
}
