// SPDX-License-Identifier: AGPL-3.0-or-later
/** Repository URL for the AGPL "Código fuente" link, injected at build time. */
declare const __REPO_URL__: string
/** Full SHA of the commit this build comes from, or '' when unknown. Injected at build time. */
declare const __BUILD_SHA__: string
/** Release version MAJOR.MINOR.PATCH (ADR 0032), or '' when the build has none. Injected at build time. */
declare const __BUILD_VERSION__: string
/** Build time, milliseconds since the epoch. Injected at build time. */
declare const __BUILD_TIME__: number

/** A file's bytes as base64, from the `?base64` import (scripts/vite-plugins.ts, base64Import). */
declare module '*?base64' {
  const base64: string
  export default base64
}
