// SPDX-License-Identifier: AGPL-3.0-or-later
/** Repository URL for the AGPL "Código fuente" link, injected at build time. */
declare const __REPO_URL__: string

/** A file's bytes as base64, from the `?base64` import (scripts/vite-plugins.ts, base64Import). */
declare module '*?base64' {
  const base64: string
  export default base64
}
