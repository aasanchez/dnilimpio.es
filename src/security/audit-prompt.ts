// SPDX-License-Identifier: AGPL-3.0-or-later
// The prompt the start screen offers to copy into an AI coding agent, so anyone can check the
// privacy claim against the source code and the live site instead of taking it on trust. English
// on purpose: coding agents work best with it, and the code it points at is in English.
// Keep it short and neutral: it states the claims and where the evidence is, and asks the agent to
// disprove them. It does not explain why something is fine or answer findings in advance.
/** The live site the prompt asks the agent to check against the repository. */
export const LIVE_SITE = 'https://dnitapado.es/'

export const AUDIT_PROMPT = `Audit the repository https://github.com/aasanchez/dnilimpio.es and the live site built from it, ${LIVE_SITE}. Treat every claim below as unproven. Try to disprove each one.

Claims:
1. Photos of the DNI/TIE, file names, text read from the card and watermark text are processed in the browser and are not sent anywhere.
2. Nothing of the user's is stored. The only exceptions are the date the notice was closed (localStorage key dnilimpio.noticeDismissedAt) and the app's own files and AI models in Cache Storage.
3. No cookies, no analytics, no third-party scripts, frames or fonts.
4. The app page cannot reach any other origin. Its CSP (scripts/csp.ts) has connect-src 'none' and allows scripts, styles, images and fonts only from its own origin; from the photo step on, a stricter policy is added (src/security/intake-lockdown.ts).
5. The service worker (src/sw.ts, src/offline/precache.ts) serves only files listed in its manifest, refuses every other request, and checks every cached file against its SHA-384 hash. Check also what is possible when it does not control the page.
6. One request is sent on purpose: opt-in usage stats, from thanks.html, a separate page that holds no photo, only after a tap. Fields (src/stats/schema.ts): v, doc, ai, back, fields, boxes, mark, grey, lang, app, src, ocr, device, os, browser, bv, pwa. Receiver: worker/index.ts, src/stats/endpoint.ts.
7. The deployed files are a reproducible build of the commit shown in the page footer.
8. The README section "Privacy and security" and the in-app privacy text state nothing the code does not support.

Check the live site, not only the source:
- Compare the CSP and response headers served for / and /thanks.html with scripts/csp.ts and scripts/headers.ts.
- Hash every served file and compare it with the page's integrity attributes and the manifest in sw.js.
- Request .map URLs for the served scripts.
- Send malformed requests to POST /stats. Do not send stats that would be accepted.
- Rebuild the footer's commit as the README describes and compare the files byte for byte.
If you cannot reach the live site, say so and mark those checks as not done.

Report each finding with a severity (critical, high, medium, low, info), the claim it affects and the evidence (file and line, command and output, or URL and response). List what you could not verify. Do not give an overall pass or fail.
`
