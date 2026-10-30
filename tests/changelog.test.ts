import { describe, expect, it } from 'vitest'
import { parseChangelog } from '../src/shared/changelog'

const SAMPLE = `# Changelog

Some intro text that is ignored.

## Unreleased

### Added
- Hover arrows
- A longer item
  that continues here

### Fixed
- The Numbers button

## 0.1.6
- Update check starts sooner.

## 0.1.3 and earlier
- First releases.

## 0.0.1
`

describe('parseChangelog', () => {
  const entries = parseChangelog(SAMPLE)

  it('reads releases newest first, as written, and skips empty ones', () => {
    expect(entries.map((e) => e.title)).toEqual(['Unreleased', '0.1.6', '0.1.3 and earlier'])
    expect(entries.map((e) => e.version)).toEqual([null, '0.1.6', '0.1.3'])
  })

  it('reads groups and items', () => {
    expect(entries[0].groups.map((g) => g.heading)).toEqual(['Added', 'Fixed'])
    expect(entries[0].groups[0].items).toEqual([
      'Hover arrows',
      'A longer item that continues here'
    ])
    expect(entries[1].groups).toEqual([{ heading: null, items: ['Update check starts sooner.'] }])
  })

  it('copes with empty input and Windows line endings', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('## 1.0.0\r\n- One\r\n')[0].groups[0].items).toEqual(['One'])
  })
})
