// SPDX-License-Identifier: AGPL-3.0-or-later
// Single entry point for the on-demand PDF module, so every caller shares one load.

let pending: Promise<typeof import('./export.ts')> | null = null

export async function loadExport (): Promise<typeof import('./export.ts')> {
  pending ??= import('./export.ts').catch((e: unknown) => {
    pending = null // allow a retry, e.g. after the network comes back
    throw e
  })
  return await pending
}
