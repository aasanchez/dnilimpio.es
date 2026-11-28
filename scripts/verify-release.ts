// SPDX-License-Identifier: AGPL-3.0-or-later
// Checks the signed build provenance of every file of a release, with the GitHub CLI:
//
//   node scripts/verify-release.ts <dir> <full commit SHA>
//
// <dir> holds the files to check: the `dist` artifact, the `release-evidence` artifact, or a copy of
// the live site. Each file must carry a provenance attestation that GitHub signed for:
// - this repository (aasanchez/dnitapado.es),
// - the CI workflow on master (.github/workflows/ci.yml, ref refs/heads/master),
// - exactly the commit given, built on a GitHub-hosted runner.
// A file with no attestation, or one signed by another repository, workflow, branch or commit, fails.
//
// gh downloads the attestations from GitHub and checks the signatures against GitHub's Sigstore
// trust root. It needs a token (GH_TOKEN) to read the attestations. Exit code 1 if any file fails.
//
// gh sometimes fails before it checks anything: it cannot load the Sigstore trust root or reach
// GitHub. Such a check is tried again, up to ATTEMPTS times. A check that ran and found a wrong or
// missing attestation is never tried again.
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const REPO = 'aasanchez/dnitapado.es'
export const SIGNER_WORKFLOW = `${REPO}/.github/workflows/ci.yml`
export const SOURCE_REF = 'refs/heads/master'

/** The `gh` arguments that check one file against the pinned identity and commit. */
export function verifyArgs (file: string, sha: string): string[] {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`not a full commit SHA: ${sha}`)
  return [
    'attestation', 'verify', file,
    '--repo', REPO,
    '--signer-workflow', SIGNER_WORKFLOW,
    '--source-ref', SOURCE_REF,
    '--source-digest', sha,
    '--deny-self-hosted-runners',
    '--predicate-type', 'https://slsa.dev/provenance/v1',
  ]
}

/** Tries per file when gh fails before it checks the attestation. */
export const ATTEMPTS = 3

/**
 * True when gh's error says it could not start the check (trust root, network, GitHub API), not
 * that the attestation is wrong. Only these errors are tried again.
 */
export function isTransient (stderr: string): boolean {
  return [
    /verifier is not available/i,
    /initialization may have failed/i,
    /failed to (?:create|load|fetch|update) (?:the )?(?:TUF|trusted root)/i,
    /\b(?:timeout|timed out|connection reset|connection refused|EOF|TLS handshake)\b/i,
    /HTTP (?:429|5\d\d)/,
  ].some((re) => re.test(stderr))
}

/** Every file under `dir`, sorted, as paths that include `dir`. */
export function listFiles (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .sort()
}

async function main (): Promise<void> {
  const [dir = '', sha = ''] = process.argv.slice(2)
  if (dir === '' || sha === '') {
    console.error('Usage: node scripts/verify-release.ts <dir> <full commit SHA>')
    process.exit(2)
  }
  const files = listFiles(dir)
  if (files.length === 0) throw new Error(`${dir} is empty`)
  const run = promisify(execFile)
  const failed: string[] = []
  // A few at a time: each check is one request to GitHub.
  let next = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < files.length) {
      const file = files[next++] as string
      for (let attempt = 1; ; attempt++) {
        try {
          await run('gh', verifyArgs(file, sha))
          console.log(`ok      ${file}`)
          break
        } catch (e) {
          const stderr = (e as { stderr?: string }).stderr ?? String(e)
          if (attempt < ATTEMPTS && isTransient(stderr)) {
            console.error(`retry   ${file} (attempt ${String(attempt)}): ${stderr.trim()}`)
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
            continue
          }
          failed.push(file)
          console.error(`FAILED  ${file}\n${stderr}`)
          break
        }
      }
    }
  }))
  console.log(`${String(files.length - failed.length)} of ${String(files.length)} files carry valid provenance for ${sha}`)
  if (failed.length > 0) process.exit(1)
}

if (import.meta.main) await main()
