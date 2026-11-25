// SPDX-License-Identifier: AGPL-3.0-or-later
// Prints the SHA-384 of every file of a build, one per line, sorted by path:
//
//   node scripts/build-manifest.ts [dist]
//
// CI compares the manifests of two independent builds of the same commit (the `reproducible` job):
// with SOURCE_DATE_EPOCH and GITHUB_SHA fixed, they must be identical, so anyone can rebuild the
// site from source and check that it is what was deployed.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'dist'

function listFiles (prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(`${prefix}${e.name}/`) : [`${prefix}${e.name}`]))
}

const lines = listFiles()
  .sort()
  .map((p) => `sha384-${createHash('sha384').update(readFileSync(join(dir, p))).digest('base64')}  ${p}`)
if (lines.length === 0) throw new Error(`${dir} is empty`)
process.stdout.write(lines.join('\n') + '\n')
