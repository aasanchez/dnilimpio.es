// SPDX-License-Identifier: AGPL-3.0-or-later
// Object URLs of downloads that the browser may still be reading. Pure: no DOM import.
//
// A download link needs its object URL for a moment after the click; some browsers (Safari on iOS,
// with its download prompt) read it late. So each URL is revoked after a delay, and every URL still
// open is revoked at once when the person clears everything or leaves the page (revokeDownloads).
// Until it is revoked, the URL keeps the PDF reachable in memory.

/** How long a download keeps its URL when nothing clears it sooner. */
export const DOWNLOAD_URL_MS = 10_000

const open = new Map<string, ReturnType<typeof setTimeout>>()

function revoke (url: string): void {
  const timer = open.get(url)
  if (timer !== undefined) clearTimeout(timer)
  open.delete(url)
  URL.revokeObjectURL(url)
}

/** Creates an object URL for a download; it is revoked after DOWNLOAD_URL_MS, or by revokeDownloads(). */
export function downloadUrl (blob: Blob): string {
  const url = URL.createObjectURL(blob)
  open.set(url, setTimeout(() => { revoke(url) }, DOWNLOAD_URL_MS))
  return url
}

/** Revokes every download URL still open, e.g. on reset or when the page is left. */
export function revokeDownloads (): void {
  for (const url of [...open.keys()]) revoke(url)
}

/** How many download URLs are still open (for tests). */
export function openDownloads (): number {
  return open.size
}
