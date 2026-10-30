import { useEffect, useState } from 'react'
import { useApp, type ConfirmState } from '../lib/store'

export function ConfirmDialog(): React.JSX.Element | null {
  const confirm = useApp((s) => s.confirm)
  // The body is a component of its own, so the check boxes start fresh for every dialog.
  return confirm ? <ConfirmBody confirm={confirm} /> : null
}

function ConfirmBody({ confirm }: { confirm: ConfirmState }): React.JSX.Element {
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries((confirm.checks ?? []).map((c) => [c.id, c.checked])))
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        confirm.resolve(false)
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        confirm.resolve(true, values)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirm, values])
  return (
    <div className="overlay" onMouseDown={() => confirm.resolve(false)}>
      <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{confirm.title}</h2>
        <p>{confirm.body}</p>
        {confirm.checks && (
          <div className="dlg-checks">
            {confirm.checks.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={values[c.id] ?? c.checked} onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.checked }))} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        )}
        <div className="buttons">
          <button className="btn" onClick={() => confirm.resolve(false)}>
            Cancel
          </button>
          <button className={'btn ' + (confirm.danger ? 'danger' : 'primary')} autoFocus onClick={() => confirm.resolve(true, values)}>
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
          {t.sticky && (
            <button className="btn small" onClick={() => dismiss(t.id)}>
              Later
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
