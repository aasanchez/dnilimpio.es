// SPDX-License-Identifier: AGPL-3.0-or-later
// The prompt the start screen offers to copy into an AI coding agent, so anyone can check the
// privacy claim against the source code and the live site instead of taking it on trust. English
// on purpose: coding agents work best with it, and the code it points at is in English.
/** The live site the prompt asks the agent to check against the repository. */
export const LIVE_SITE = 'https://dnitapado.es/'

export const AUDIT_PROMPT = `Perform a deep security and privacy audit of the codebase at https://github.com/aasanchez/dnilimpio.es and of the live site built from it at ${LIVE_SITE} to verify its core privacy claim: that processing of Spanish DNI/TIE documents runs on the device, in the browser, and that the app does not send the images, file names, text read from the card or watermark text to any server.

Execute the audit across the following areas:

1. Image Ingestion & Lifecycle Tracing

   - Trace the exact data flow from the moment a user selects or drops a DNI/TIE image (File, Blob, ArrayBuffer, DataURL, ObjectURL) through canvas rendering, watermarking, text overlay, compression, and final download/export.
   - Verify whether any temporary objects, IndexedDB entries, localStorage/sessionStorage, or Service Worker caches persist the image or extracted metadata after processing or tab closure.
   - Check that the public wording is exactly true, no more and no less: the start-screen notice (privacyBody in src/i18n/locales/en.json and es.json, short on purpose) and the "Privacy and security" section of README.md, which lists what the browser keeps: the app's files and AI models in Cache Storage and the date the notice was closed (localStorage key dnilimpio.noticeDismissedAt). Flag any claim the code does not support, and anything stored or sent that the README leaves out.

2. Network & Outbound Traffic Audit

   - Search the entire codebase and dependencies for network primitives (fetch, XMLHttpRequest, navigator.sendBeacon, WebSocket, EventSource, WebRTC, form action attributes, dynamic <img>/<script> beacons).
   - Check if any telemetry, analytics (e.g., Google Analytics, Plausible, Sentry, PostHog), error reporting, or third-party font/CDN requests leak document data, filenames, or usage payloads.
   - No third-party script runs in the page that holds the photos (docs/adr/0023-no-third-party-script-with-photos.md). The site has no analytics code either: no script, frame, pixel or cookie; the host counts the requests it serves (docs/adr/0027-security-headers-from-the-host.md). Verify that the app opens no frame and that the CSP has no frame-src, so default-src 'none' forbids every frame. Verify that the CSP has script-src 'self' only (plus 'wasm-unsafe-eval' and the import map's hash) and connect-src 'none', without 'self', so the page cannot send requests to any origin, its own included (docs/adr/0022-no-published-source-maps.md); that the Trusted Types policy accepts only the service worker and OCR worker URLs; and that the service worker refuses every request to another origin. Assess what any script running in the page could technically reach, and whether those limits contain it.
   - Inspect any server-side code, API routes, serverless functions, or backend configurations (e.g., Next.js API routes, Cloudflare Workers, Nginx/Vercel configs) to confirm whether endpoints exist that could receive uploads.

3. Dependency & Supply Chain Verification

   - Verify whether any dependency makes remote API calls (e.g., remote OCR engines or cloud image processors) rather than executing purely client-side via WebAssembly or native Canvas APIs.

4. Security Headers, CSP & Build/Deployment Integrity

   - Check index.html, meta tags, and deployment configurations (vercel.json, netlify.toml, _headers, Dockerfiles, GitHub Actions) for Content Security Policy (connect-src, img-src, default-src) that technically enforces zero outbound data exfiltration at the browser level.
   - Check if the deployed production bundle can be reproducibly built from this repository without hidden injected scripts. The site publishes no source maps (docs/adr/0022-no-published-source-maps.md): verify the deployed minified files by hash against a rebuild of the same commit (scripts/build-manifest.ts, build provenance via gh attestation verify, scripts/smoke.ts).
   - Check which same-origin requests remain possible (img-src, script-src, font-src 'self' and the OCR worker's own CSP, workerCsp() in src/offline/precache.ts), whether any of them can carry data in its URL, and whether the service worker (src/offline/precache.ts, route()) refuses every same-origin request that is not a file of this build. Note the moments the service worker does not control the page (first visit, forced reload, worker disabled).

5. Live Site Verification (${LIVE_SITE})

   - Fetch ${LIVE_SITE} and record the HTTP status, every response header and any redirect (www.dnitapado.es serves the same files with the same headers; the earlier address https://aasanchez.github.io/dnilimpio.es/ should redirect to the live site). Compare the response headers with scripts/headers.ts and flag any Set-Cookie.
   - Extract the <meta http-equiv="Content-Security-Policy"> from the served index.html and compare it, directive by directive, with scripts/csp.ts. The only expected difference is one extra script-src hash, which must be the SHA-256 of the inline import map. Flag any other source, especially in connect-src.
   - For every script, stylesheet and import-map entry the page references, download the file, compute its SHA-384 and compare it with the integrity value in the page. Flag any file without SRI, any third-party host and any Set-Cookie header.
   - Download sw.js and check that every file in its inlined manifest matches its listed SHA-384 on the live site. Request a few .map URLs (for example the entry script's URL plus .map) and confirm none is served.
   - Read the commit SHA shown in the page footer (and in the entry script), check out that commit, rebuild it as the README describes (SOURCE_DATE_EPOCH, GITHUB_SHA) and compare the live files with dist/ byte for byte. Where available, run gh attestation verify on a downloaded file.
   - If you cannot fetch the live site from your environment, say so explicitly and mark these checks as not done. Do not infer their result from the source.

6. Deliverable Format

   - Executive Verdict: Clear YES/NO on whether DNI/TIE images stay strictly local, with a confidence rating.
   - Data Flow Map: Step-by-step trace referencing exact file paths, functions, and line numbers.
   - Live Site Match: Whether the files and CSP served at ${LIVE_SITE} match this repository at the commit shown in the footer, with the hashes you compared.
   - Findings & Risks: Any data leaks, persistent storage artifacts, third-party requests, or missing browser-level safeguards (e.g., a CSP connect-src other than 'none', any frame-src, any cookie, or any third-party script or frame in the app's page).
   - Hardening Recommendations: Concrete code or configuration changes to mathematically/technically guarantee zero exfiltration (such as strict CSP headers and memory cleanup).
`
