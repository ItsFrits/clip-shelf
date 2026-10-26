import { Star } from 'lucide-react'

interface Props {
  value: number
  onChange: (rating: number) => void
  size?: number
}

/** Five stars. Clicking the current rating clears it. */
export function Stars({ value, onChange, size = 22 }: Props): React.JSX.Element {
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <Star size={size} strokeWidth={1.75} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}
