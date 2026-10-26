import { useEffect, useRef } from 'react'
import { ConfirmDialog, Toasts } from './components/Overlays'
import { Library } from './components/Library'
import { Player } from './components/Player'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { useHotkeys } from './lib/hotkeys'
import { DIALOG_DIM, MODAL_DIM, combineDim, resolveMotion } from '@shared/uiPrefs'
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

  // The window buttons of the system sit on top of the page, so they are darkened by hand to
  // match the dark layer behind the settings window and dialogs.
  const modalOpen = view === 'settings' && settingsView === 'window'
  const confirmOpen = useApp((s) => s.confirm !== null)
  const modalWasOpen = useRef(false)
  useEffect(() => {
    const alpha = combineDim([modalOpen ? MODAL_DIM : 0, confirmOpen ? DIALOG_DIM : 0])
    const motion = resolveMotion(animations, animationSpeed, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    // Only the opening of the settings window fades in. Closing and dialogs are instant.
    const fadeMs = modalOpen && !modalWasOpen.current && !motion.off ? 200 * motion.scale : 0
    modalWasOpen.current = modalOpen
    window.api.setTitleBarDim(alpha, fadeMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, confirmOpen])

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
