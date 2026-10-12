import { useEffect } from 'react'
import { useApp } from '../lib/store'

export function ConfirmDialog(): React.JSX.Element | null {
  const confirm = useApp((s) => s.confirm)
  useEffect(() => {
    if (!confirm) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        confirm.resolve(false)
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        confirm.resolve(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirm])
  if (!confirm) return null
  return (
    <div className="overlay" onMouseDown={() => confirm.resolve(false)}>
      <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{confirm.title}</h2>
        <p>{confirm.body}</p>
        <div className="buttons">
          <button className="btn" onClick={() => confirm.resolve(false)}>
            Cancel
          </button>
          <button className={'btn ' + (confirm.danger ? 'danger' : 'primary')} autoFocus onClick={() => confirm.resolve(true)}>
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toasts(): React.JSX.Element {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.kind === 'error' ? ' error' : '')}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="btn small"
              onClick={() => {
                t.action?.()
                dismiss(t.id)
              }}
            >
              {t.actionLabel ?? 'Undo'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
