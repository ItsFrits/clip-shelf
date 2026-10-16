import { useApp } from '../lib/store'

/** A small keyboard shortcut label. Hidden everywhere when the user turns key hints off. */
export function KeyHint(props: { children: React.ReactNode; style?: React.CSSProperties }): React.JSX.Element | null {
  const show = useApp((s) => s.user.settings.showKeyHints)
  if (!show) return null
  return (
    <span className="kbd" style={props.style}>
      {props.children}
    </span>
  )
}

/** Style for a hint that sits on a filled (accent) button. */
export const ON_ACCENT: React.CSSProperties = { background: 'rgba(26,15,5,.14)', border: 0, color: 'inherit' }
