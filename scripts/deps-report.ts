// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns the JSON of `pnpm audit` or `pnpm outdated` into a Markdown report (workflow deps-check.yml):
//
//   pnpm audit --json > audit.json;              node scripts/deps-report.ts audit audit.json [high]
//   pnpm outdated --format json > outdated.json; node scripts/deps-report.ts outdated outdated.json
//
// The report goes to stdout, and to the job summary when GITHUB_STEP_SUMMARY is set.
//
// audit: `pnpm audit` checks the whole dependency tree (direct and transitive). For each advisory the
// report names the direct dependency (from package.json) that pulls the vulnerable package in, and
// whether that is a runtime or a dev dependency, because the direct dependency is the one to update.
// Exit code 1 when an advisory is at or above the level given (default: high).
//
// outdated: `pnpm outdated` already lists direct dependencies only. Report only: exit code 0, plus a
// warning annotation for each deprecated package.
import { appendFileSync, readFileSync } from 'node:fs'

export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

export interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

interface Advisory {
  module_name: string
  severity: Severity
  title: string
  url: string
  vulnerable_versions: string
  patched_versions: string
  findings: Array<{ version: string, paths: string[] }>
}

interface AuditJson {
  advisories: Record<string, Advisory>
}

interface OutdatedEntry {
  current?: string
  latest: string
  wanted: string
  isDeprecated: boolean
  dependencyType: 'dependencies' | 'devDependencies' | 'optionalDependencies'
}

export interface Report {
  markdown: string
  failed: boolean
  /** GitHub workflow commands (annotations), one per line. */
  annotations: string[]
}

/** 'runtime' for dependencies and optionalDependencies (they ship to the browser), else 'dev'. */
function scopeOf (manifest: Manifest, name: string): 'runtime' | 'dev' | 'unknown' {
  if (manifest.dependencies?.[name] != null || manifest.optionalDependencies?.[name] != null) return 'runtime'
  if (manifest.devDependencies?.[name] != null) return 'dev'
  return 'unknown'
}

/** The direct dependency in a pnpm audit path such as `.>tesseract.js>node-fetch` (root importer first). */
export function directOf (path: string): string {
  const parts = path.split('>')
  if (parts[0] === '.') parts.shift()
  return parts[0] ?? path
}

/** Escapes text for a Markdown table cell. */
function cell (text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

export function auditReport (json: unknown, manifest: Manifest, failLevel: Severity = 'high'): Report {
  if (json == null || typeof json !== 'object' || !('advisories' in json) || json.advisories == null) {
    throw new Error('Not the JSON of `pnpm audit --json`: no "advisories"')
  }
  const advisories = Object.values((json as AuditJson).advisories)
    .sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || a.module_name.localeCompare(b.module_name))
  const threshold = SEVERITIES.indexOf(failLevel)

  const counts = new Map<Severity, number>(SEVERITIES.map((s) => [s, 0]))
  for (const a of advisories) counts.set(a.severity, (counts.get(a.severity) ?? 0) + 1)
  const failing = advisories.filter((a) => SEVERITIES.indexOf(a.severity) >= threshold)

  const lines = ['### Dependency audit', '']
  if (advisories.length === 0) {
    lines.push('No known vulnerabilities in the dependency tree (direct and transitive, runtime and dev).')
  } else {
    lines.push(
      `${String(advisories.length)} advisories: ${[...SEVERITIES].reverse().map((s) => `${String(counts.get(s) ?? 0)} ${s}`).join(', ')}. ` +
        `The run fails at **${failLevel}** or above (${String(failing.length)}).`,
      '',
      '"Via" is the direct dependency in package.json to update. "Direct" means the vulnerable package is itself in package.json.',
      '',
      '| Severity | Package | Vulnerable | Fixed in | Via (scope) | Direct | Advisory |',
      '|---|---|---|---|---|---|---|'
    )
    for (const a of advisories) {
      const paths = a.findings.flatMap((f) => f.paths)
      const via = [...new Set(paths.map(directOf))].sort()
      const viaText = via.map((d) => `${d} (${scopeOf(manifest, d)})`).join(', ')
      const direct = via.includes(a.module_name) ? 'yes' : 'no'
      const versions = [...new Set(a.findings.map((f) => f.version))].join(', ')
      lines.push(
        `| ${a.severity} | ${cell(a.module_name)} ${cell(versions)} | \`${cell(a.vulnerable_versions)}\` | \`${cell(a.patched_versions)}\` | ${cell(viaText)} | ${direct} | [${cell(a.title)}](${a.url}) |`
      )
    }
  }
  return { markdown: lines.join('\n') + '\n', failed: failing.length > 0, annotations: [] }
}

/** 'major', 'minor' or 'patch': the biggest part of the version that changes from current to latest. */
export function bumpOf (current: string, latest: string): 'major' | 'minor' | 'patch' {
  const [a, b] = current.split('.')
  const [x, y] = latest.split('.')
  if (a !== x) return 'major'
  if (b !== y) return 'minor'
  return 'patch'
}

export function outdatedReport (json: unknown): Report {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Not the JSON of `pnpm outdated --format json`')
  }
  const entries = Object.entries(json as Record<string, OutdatedEntry>).sort(([a], [b]) => a.localeCompare(b))
  const lines = ['### Outdated direct dependencies', '']
  const annotations: string[] = []
  if (entries.length === 0) {
    lines.push('Every direct dependency (runtime and dev) is on its latest version.')
  } else {
    lines.push(
      `${String(entries.length)} direct dependencies have a newer version. Versions are pinned exactly, so "current" is the pin.`,
      '',
      '| Package | Scope | Current | Latest | Change | Deprecated |',
      '|---|---|---|---|---|---|'
    )
    for (const [name, e] of entries) {
      const current = e.current ?? e.wanted
      const scope = e.dependencyType === 'devDependencies' ? 'dev' : 'runtime'
      lines.push(`| ${cell(name)} | ${scope} | ${cell(current)} | ${cell(e.latest)} | ${bumpOf(current, e.latest)} | ${e.isDeprecated ? '**yes**' : 'no'} |`)
      if (e.isDeprecated) annotations.push(`::warning title=Deprecated dependency::${name}@${current} is deprecated`)
    }
  }
  return { markdown: lines.join('\n') + '\n', failed: false, annotations }
}

function main (): void {
  const [mode, file, level = 'high'] = process.argv.slice(2)
  if (file == null || (mode !== 'audit' && mode !== 'outdated')) {
    throw new Error('Usage: node scripts/deps-report.ts audit|outdated <file.json> [fail level]')
  }
  if (!(SEVERITIES as readonly string[]).includes(level)) throw new Error(`Unknown level: ${level}`)
  const json: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest
  const report = mode === 'audit' ? auditReport(json, manifest, level as Severity) : outdatedReport(json)
  process.stdout.write(report.markdown)
  for (const a of report.annotations) process.stdout.write(a + '\n')
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary != null && summary !== '') appendFileSync(summary, report.markdown)
  if (report.failed) process.exitCode = 1
}

if (import.meta.main) main()
