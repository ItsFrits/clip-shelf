import { useApp } from '../lib/store'
import { fmtCount } from '../lib/format'

export function StatusBar(): React.JSX.Element {
  const folders = useApp((s) => s.folders)
  const jobs = useApp((s) => s.jobs)
  const update = useApp((s) => s.update)
  const version = useApp((s) => s.appInfo.version)
  const offline = folders.filter((f) => !f.online)
  const online = folders.length - offline.length
  const done = jobs.total - jobs.pending

  return (
    <footer className="statusbar">
      <span className="item">
        <span className="dot" style={{ background: offline.length ? '#e0b052' : 'var(--s-tagged)' }} />
        {folders.length === 0
          ? 'No folders yet'
          : `Watching ${online} of ${folders.length} folder${folders.length === 1 ? '' : 's'}` +
            (offline.length ? ` · ${offline.map((f) => f.name).join(', ')} offline` : '')}
      </span>
      {jobs.pending > 0 && (
        <span className="item">
          Reading clips
          <span className="mini-bar">
            <span style={{ width: `${jobs.total ? (done / jobs.total) * 100 : 0}%` }} />
          </span>
          <span className="mono">
            {fmtCount(done)} / {fmtCount(jobs.total)}
          </span>
        </span>
      )}
      <span className="item" style={{ marginLeft: 'auto' }}>
        {update.state === 'downloading' && `Downloading update ${update.version ?? ''} ${update.percent ?? 0}%`}
        {update.state === 'ready' && (
          <>
            Update {update.version} is ready.
            <button className="link-btn" onClick={() => void window.api.installUpdate()}>
              Restart to install
            </button>
          </>
        )}
        {version && <span className="mono">v{version}</span>}
      </span>
    </footer>
  )
}
