// SPDX-License-Identifier: AGPL-3.0-or-later
// Single entry point for the on-demand document detection module (edge detection, warp and MRZ
// reading), so the first page load does not include it.

let pending: Promise<typeof import('./detect-doc.ts')> | null = null

export async function loadDetect (): Promise<typeof import('./detect-doc.ts')> {
  pending ??= import('./detect-doc.ts').catch((e: unknown) => {
    pending = null
    throw e
  })
  return await pending
}
