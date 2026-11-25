// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { auditReport, bumpOf, directOf, outdatedReport } from '../../scripts/deps-report.ts'

const manifest = {
  dependencies: { 'tesseract.js': '7.0.0' },
  devDependencies: { vite: '8.3.8' },
}

function advisory (module: string, severity: string, paths: string[]): object {
  return {
    module_name: module,
    severity,
    title: `${module} issue`,
    url: `https://github.com/advisories/${module}`,
    vulnerable_versions: '<2.0.0',
    patched_versions: '>=2.0.0',
    findings: [{ version: '1.0.0', paths }],
  }
}

describe('directOf', () => {
  it('takes the first package after the root importer', () => {
    expect(directOf('.>tesseract.js>node-fetch')).toBe('tesseract.js')
    expect(directOf('.>vite')).toBe('vite')
    expect(directOf('vite>esbuild')).toBe('vite')
  })
})

describe('auditReport', () => {
  it('passes with no advisories', () => {
    const r = auditReport({ advisories: {} }, manifest)
    expect(r.failed).toBe(false)
    expect(r.markdown).toContain('No known vulnerabilities')
  })

  it('names the direct dependency and its scope, and fails at the level', () => {
    const json = {
      advisories: {
        1: advisory('node-fetch', 'high', ['.>tesseract.js>node-fetch']),
        2: advisory('vite', 'moderate', ['.>vite']),
      },
    }
    const r = auditReport(json, manifest, 'high')
    expect(r.failed).toBe(true)
    expect(r.markdown).toContain('| high | node-fetch 1.0.0 |')
    expect(r.markdown).toContain('tesseract.js (runtime) | no |')
    expect(r.markdown).toContain('vite (dev) | yes |')
    expect(auditReport(json, manifest, 'critical').failed).toBe(false)
  })

  it('rejects output that is not pnpm audit JSON', () => {
    expect(() => auditReport({ error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } }, manifest)).toThrow()
  })
})

describe('outdatedReport', () => {
  it('lists packages with scope and change, never fails, warns on deprecated', () => {
    const r = outdatedReport({
      typescript: { current: '6.0.3', latest: '7.0.2', wanted: '6.0.3', isDeprecated: false, dependencyType: 'devDependencies' },
      old: { current: '1.0.0', latest: '1.0.1', wanted: '1.0.0', isDeprecated: true, dependencyType: 'dependencies' },
    })
    expect(r.failed).toBe(false)
    expect(r.markdown).toContain('| typescript | dev | 6.0.3 | 7.0.2 | major | no |')
    expect(r.markdown).toContain('| old | runtime | 1.0.0 | 1.0.1 | patch | **yes** |')
    expect(r.annotations).toEqual(['::warning title=Deprecated dependency::old@1.0.0 is deprecated'])
  })

  it('reports nothing outdated', () => {
    expect(outdatedReport({}).markdown).toContain('latest version')
  })
})

describe('bumpOf', () => {
  it('classifies the change', () => {
    expect(bumpOf('1.27.0', '1.31.1')).toBe('minor')
    expect(bumpOf('26.6.6', '26.6.7')).toBe('patch')
    expect(bumpOf('6.0.3', '7.0.2')).toBe('major')
  })
})
