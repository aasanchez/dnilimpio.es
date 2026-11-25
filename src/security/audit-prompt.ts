// SPDX-License-Identifier: AGPL-3.0-or-later
// The prompt the start screen offers to copy into an AI coding agent, so anyone can check the
// privacy claim against the source code instead of taking it on trust. English on purpose: coding
// agents work best with it, and the code it points at is in English.
export const AUDIT_PROMPT = `Perform a deep security and privacy audit of the codebase at https://github.com/aasanchez/dnilimpio.es to verify its core privacy claim: that Spanish DNI/TIE document images are processed 100% locally in the browser and never transmitted to any external server.

Execute the audit across the following areas:

1. Image Ingestion & Lifecycle Tracing

   - Trace the exact data flow from the moment a user selects or drops a DNI/TIE image (File, Blob, ArrayBuffer, DataURL, ObjectURL) through canvas rendering, watermarking, text overlay, compression, and final download/export.
   - Verify whether any temporary objects, IndexedDB entries, localStorage/sessionStorage, or Service Worker caches persist the image or extracted metadata after processing or tab closure.

2. Network & Outbound Traffic Audit

   - Search the entire codebase and dependencies for network primitives (fetch, XMLHttpRequest, navigator.sendBeacon, WebSocket, EventSource, WebRTC, form action attributes, dynamic <img>/<script> beacons).
   - Check if any telemetry, analytics (e.g., Google Analytics, Plausible, Sentry, PostHog), error reporting, or third-party font/CDN requests leak document data, filenames, or usage payloads.
   - Inspect any server-side code, API routes, serverless functions, or backend configurations (e.g., Next.js API routes, Cloudflare Workers, Nginx/Vercel configs) to confirm whether endpoints exist that could receive uploads.

3. Dependency & Supply Chain Verification

   - Verify whether any dependency makes remote API calls (e.g., remote OCR engines or cloud image processors) rather than executing purely client-side via WebAssembly or native Canvas APIs.

4. Security Headers, CSP & Build/Deployment Integrity

   - Check index.html, meta tags, and deployment configurations (vercel.json, netlify.toml, _headers, Dockerfiles, GitHub Actions) for Content Security Policy (connect-src, img-src, default-src) that technically enforces zero outbound data exfiltration at the browser level.
   - Check if the deployed production bundle can be reproducibly built from this repository without hidden injected scripts.

5. Deliverable Format

   - Executive Verdict: Clear YES/NO on whether DNI/TIE images stay strictly local, with a confidence rating.
   - Data Flow Map: Step-by-step trace referencing exact file paths, functions, and line numbers.
   - Findings & Risks: Any data leaks, persistent storage artifacts, third-party requests, or missing browser-level safeguards (e.g., lack of strict CSP connect-src 'none').
   - Hardening Recommendations: Concrete code or configuration changes to mathematically/technically guarantee zero exfiltration (such as strict CSP headers and memory cleanup).
`
