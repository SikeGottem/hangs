// Fails the lint step if app/** or components/** use raw colours or arbitrary colour/radius/font-size values instead of tokens.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIRS = ['app', 'components']
const EXCLUDE = new Set(['app/globals.css'])
const EXT = /\.(ts|tsx|css)$/

const RULES = [
  { re: /#[0-9a-fA-F]{3,8}\b/g, why: 'raw hex colour (use a token from globals.css, or BRAND from lib/brand.ts in OG/icon code)' },
  { re: /\brgba?\(/g, why: 'rgb()/rgba() colour (use a token)' },
  { re: /-\[#/g, why: 'Tailwind arbitrary colour (use a token utility)' },
  { re: /rounded(-[a-z]+)?-\[/g, why: 'Tailwind arbitrary radius (use rounded-sm/md/lg/xl/2xl/full)' },
  { re: /\btext-\[\d/g, why: 'Tailwind arbitrary font size (use the type scale: text-xs..4xl, text-h3/h2/hero/display/date)' },
  { re: /\bleading-\[\d/g, why: 'Tailwind arbitrary line height (use leading-display / leading-tight / leading-none)' },
]

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

const files = DIRS.flatMap(d => {
  try { return walk(join(ROOT, d), []) } catch { return [] }
})

const problems = []
for (const file of files) {
  const rel = relative(ROOT, file)
  if (EXCLUDE.has(rel)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const { re, why } of RULES) {
      re.lastIndex = 0
      const m = re.exec(line)
      if (m) problems.push(`${rel}:${i + 1}: ${why}: ${m[0]}`)
    }
  })
}

if (problems.length) {
  console.error(`check-tokens: ${problems.length} problem(s)\n` + problems.join('\n'))
  process.exit(1)
}
console.log(`check-tokens: ${files.length} files clean`)
