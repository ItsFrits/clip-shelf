// Usage: npm run release -- 0.2.0
// Bumps the version in package.json, package-lock.json and CHANGELOG.md in one go,
// commits, pushes and tags. The tag starts the GitHub build.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
const fail = (msg) => {
  console.error(`\nRelease stopped: ${msg}\n`)
  process.exit(1)
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const parse = (v) => v.split('.').map(Number)

if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
  fail('give a version like 0.2.0, for example: npm run release -- 0.2.0')

const pkgText = readFileSync('package.json', 'utf8')
const current = JSON.parse(pkgText).version
const [a, b] = [parse(version), parse(current)]
const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
if (newer <= 0) fail(`${version} is not newer than the current version ${current}`)

if (read('git branch --show-current') !== 'main') fail('switch to main first (git switch main)')
if (read('git status --porcelain') !== '')
  fail('there are uncommitted changes, commit or merge those first')
if (read(`git tag --list v${version}`) !== '') fail(`tag v${version} already exists`)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const eol = changelog.includes('\r\n') ? '\r\n' : '\n'
const match = /^## Unreleased[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(changelog)
if (!match || match[1].trim() === '') fail('CHANGELOG.md has no notes under "## Unreleased"')

run('npm run typecheck')
run('npm test')

// package.json and package-lock.json: change only the version, keep the file's line endings.
const writeJson = (file, edit) => {
  const text = readFileSync(file, 'utf8')
  const lineEnd = text.includes('\r\n') ? '\r\n' : '\n'
  const data = JSON.parse(text)
  edit(data)
  const out =
    JSON.stringify(data, null, 2).replace(/\n/g, lineEnd) + (text.endsWith('\n') ? lineEnd : '')
  writeFileSync(file, out)
}
writeJson('package.json', (d) => {
  d.version = version
})
if (existsSync('package-lock.json')) {
  writeJson('package-lock.json', (d) => {
    d.version = version
    if (d.packages?.['']) d.packages[''].version = version
  })
}
writeFileSync(
  'CHANGELOG.md',
  changelog.replace(/^## Unreleased/m, `## Unreleased${eol}${eol}## ${version}`)
)

run('git add -A')
run(`git commit -m "Release ${version}"`)
run('git push')
run(`git tag v${version}`)
run(`git push origin v${version}`)
console.log(`\nDone. v${version} is on GitHub, the build starts now (tab Actions).`)
