import { ExternalLink, FolderOpen, MessageSquarePlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { parseChangelog } from '@shared/changelog'
import changelogText from '../../../../CHANGELOG.md?raw'
import { useApp } from '../lib/store'

const REPO = 'https://github.com/ItsFrits/clip-shelf'
const SHOWN_AT_FIRST = 5

/** Text between backticks becomes code. */
function Inline({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))}
    </>
  )
}

function Row(props: { title: string; desc: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="setting-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{props.title}</div>
        <div className="desc">{props.desc}</div>
      </div>
      {props.children}
    </div>
  )
}

export function AboutTab(): React.JSX.Element {
  const appInfo = useApp((s) => s.appInfo)
  const folders = useApp((s) => s.folders)
  const clipCount = useApp((s) => s.clips.size)
  const tagCount = useApp((s) => s.user.tags.length)
  const toast = useApp((s) => s.toast)
  const [showAll, setShowAll] = useState(false)

  // A build you install never shows unreleased notes. They only make sense while developing.
  const entries = useMemo(
    () => parseChangelog(changelogText).filter((e) => appInfo.packaged === false || e.title.toLowerCase() !== 'unreleased'),
    [appInfo.packaged]
  )
  const visible = showAll ? entries : entries.slice(0, SHOWN_AT_FIRST)

  const copyDiagnostics = async (): Promise<void> => {
    const ua = navigator.userAgent
    const electron = /Electron\/([\d.]+)/.exec(ua)?.[1] ?? '?'
    const chrome = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? '?'
    const text = [
      `Clip Shelf ${appInfo.version} (${appInfo.packaged ? 'installed' : 'development'})`,
      `Platform: ${appInfo.platform}, Electron ${electron}, Chrome ${chrome}`,
      `Folders: ${folders.length} (${folders.filter((f) => f.online).length} online), clips: ${clipCount}, tags: ${tagCount}`
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied. Paste it into your bug report.')
    } catch {
      toast('Could not copy to the clipboard.', { kind: 'error' })
    }
  }

  return (
    <>
      <h1>About</h1>
      <div className="sec-card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26 }}>Clip Shelf</span>
          <span className="mono muted">{appInfo.version ? 'v' + appInfo.version : ''}</span>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          Browse, tag and organize gameplay clips from many folders, then drag them into your video editor. Your clip files are never changed.
        </span>
      </div>

      <div className="sec-card">
        <Row title="Report a problem or suggest something" desc="Opens GitHub. Use “Copy diagnostics” first and paste it in, so I know which version and setup you have.">
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <button className="btn" onClick={() => void copyDiagnostics()}>
              Copy diagnostics
            </button>
            <a className="btn" href={`${REPO}/issues/new`} target="_blank" rel="noreferrer">
              <MessageSquarePlus size={14} />
              Open GitHub issues
            </a>
          </div>
        </Row>
        <Row title="Log files" desc="Warnings and errors are written to a log file. Attach it to a bug report when something goes wrong.">
          <button className="btn" onClick={() => void window.api.openLogsFolder()}>
            <FolderOpen size={14} />
            Open logs folder
          </button>
        </Row>
        <Row title="Source code" desc="Clip Shelf is open source.">
          <a className="btn" href={REPO} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            GitHub
          </a>
        </Row>
      </div>

      <h2 className="changelog-title">What’s new</h2>
      {entries.length === 0 && <span className="muted">No release notes yet.</span>}
      {visible.map((e) => {
        const unreleased = e.title.toLowerCase() === 'unreleased'
        return (
          <section key={e.title} className="sec-card changelog">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3>{unreleased ? 'In development' : e.title}</h3>
              {e.version && e.version === appInfo.version && <span className="pill-note">Installed</span>}
            </div>
            {e.groups.map((g, gi) => (
              <div key={gi}>
                {g.heading && <div className="h-label" style={{ margin: '4px 0 6px' }}>{g.heading}</div>}
                <ul>
                  {g.items.map((it, ii) => (
                    <li key={ii}>
                      <Inline text={it} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )
      })}
      {!showAll && entries.length > SHOWN_AT_FIRST && (
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(true)}>
          Show older versions
        </button>
      )}
    </>
  )
}
