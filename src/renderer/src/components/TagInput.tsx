import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { KeyHint } from './KeyHint'

interface Props {
  onAdd: (name: string) => void
  /** Tag ids that should not be offered (already on the clip). */
  exclude?: string[]
  placeholder?: string
  inputRef?: React.Ref<HTMLInputElement>
  menuUp?: boolean
  autoFocus?: boolean
}

/** Type to find a tag, or create a new one. Enter adds the highlighted tag. */
export function TagInput({
  onAdd,
  exclude = [],
  placeholder,
  inputRef,
  menuUp,
  autoFocus
}: Props): React.JSX.Element {
  const tags = useApp((s) => s.user.tags)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // True once the user moved the highlight with the arrow keys. Then Enter takes that option.
  const [moved, setMoved] = useState(false)

  const clean = text.trim()
  const options = useMemo(() => {
    const q = clean.toLowerCase()
    return tags
      .filter((t) => !exclude.includes(t.id) && t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1
        return as - bs || a.name.localeCompare(b.name)
      })
      .slice(0, 30)
  }, [tags, clean, exclude])
  const exact = tags.some((t) => t.name.toLowerCase() === clean.toLowerCase())
  const canCreate = clean !== '' && !exact
  const count = options.length + (canCreate ? 1 : 0)
  // The option Enter will pick. Typing a name that already exists picks that tag, not the first partial match.
  const exactIndex = options.findIndex((t) => t.name.toLowerCase() === clean.toLowerCase())
  const chosen = moved || exactIndex < 0 ? Math.min(active, Math.max(0, count - 1)) : exactIndex

  const choose = (index: number): void => {
    const name = index < options.length ? options[index].name : clean
    if (!name) return
    onAdd(name)
    setText('')
    setActive(0)
    setMoved(false)
  }

  return (
    <div className="taginput">
      <input
        ref={inputRef}
        className="field"
        style={{ width: '100%' }}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Add a tag…'}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setMoved(false)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(Math.min(chosen + 1, Math.max(0, count - 1)))
            setMoved(true)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(0, chosen - 1))
            setMoved(true)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (clean === '') return
            choose(chosen)
          } else if (e.key === 'Escape') {
            setText('')
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {open && count > 0 && (
        <div className={'menu' + (menuUp ? ' up' : '')}>
          {options.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={'opt' + (i === chosen ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(i)
              }}
            >
              <span>{t.name}</span>
              {i === chosen && clean !== '' && <KeyHint>Enter</KeyHint>}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className={'opt' + (options.length === chosen ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(options.length)
              }}
            >
              <span>
                Create <b>“{clean}”</b>
              </span>
              {options.length === chosen && clean !== '' && <KeyHint>Enter</KeyHint>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
