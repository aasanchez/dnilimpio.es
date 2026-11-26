// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFiles, verifyArgs } from '../../scripts/verify-release.ts'

const SHA = '0123456789abcdef0123456789abcdef01234567'

describe('verifyArgs', () => {
  it('pins the repository, the workflow, master, the commit and GitHub-hosted runners', () => {
    expect(verifyArgs('dist/index.html', SHA)).toEqual([
      'attestation', 'verify', 'dist/index.html',
      '--repo', 'aasanchez/dnilimpio.es',
      '--signer-workflow', 'aasanchez/dnilimpio.es/.github/workflows/ci.yml',
      '--source-ref', 'refs/heads/master',
      '--source-digest', SHA,
      '--deny-self-hosted-runners',
      '--predicate-type', 'https://slsa.dev/provenance/v1',
    ])
  })

  it('refuses anything but a full commit SHA, so the commit check cannot be left out', () => {
    for (const bad of ['', 'master', SHA.slice(0, 7), SHA.toUpperCase(), `${SHA} --help`]) {
      expect(() => verifyArgs('dist/index.html', bad)).toThrow(/full commit SHA/)
    }
  })
})

describe('listFiles', () => {
  it('lists every file in every folder, sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-'))
    mkdirSync(join(dir, 'assets/ml'), { recursive: true })
    for (const f of ['index.html', 'assets/a.js', 'assets/ml/m.onnx']) writeFileSync(join(dir, f), f)
    expect(listFiles(dir)).toEqual(['assets/a.js', 'assets/ml/m.onnx', 'index.html'].map((f) => join(dir, f)))
  })
})
