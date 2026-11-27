<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0034. No frames, no pop-ups: no new window brings back WebRTC

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (external audit of v0.1.4, finding 2: "WebRTC through a blank frame")
- Completes [ADR 0025](0025-intake-lockdown.md); no CSP change

## Context

WebRTC can send data to any server (ICE, STUN, TURN), and `connect-src` does not cover it. Since the
audit of 25 November 2026 (PR #36), `src/security/lockdown.ts` removes the WebRTC constructors from
the app's window before any other code runs.

The audit of v0.1.4 found the gap that lockdown.ts already named as a limit: every new browsing
context starts with its own, untouched copy. Checked in Chromium 158 against the built app:

- `document.body.appendChild(document.createElement('iframe')).contentWindow.RTCPeerConnection`
  works, and opens a data channel. `frame-src 'none'` does not stop it: it blocks loading a frame's
  address, not the empty `about:blank` document that every frame starts with.
- The same works for a frame nested in that frame, a `<frameset>` set as the body, `window[0]`, and
  `window.open('about:blank')`.
- `srcdoc`, `innerHTML`, `document.write`, `execCommand('insertHTML')` and `<object data>` were
  already refused, by Trusted Types.

Using the gap needs code already running in the page, which the CSP, SRI, the service worker's hash
checks and the locked dependency list are there to prevent. It is still a real gap in the defence.

The CSP has a directive for exactly this, `webrtc 'block'` (CSP Level 3). No browser implements it:
Chromium 158 logs "Unrecognized Content-Security-Policy directive 'webrtc'" and opens the
connection; Firefox bug 1783489 and WebKit bug 255651 are open and unassigned (checked
27 November 2026).

## Decision

**Frames and pop-ups are refused, from the first module on** (`src/security/frames.ts`, called by
`lockdown.ts`). The app never uses a frame or a pop-up, so this is in force from boot, not only from
the photo step: code that got a fresh copy on the start screen could keep it for later.

1. Every DOM method that inserts a given node (`appendChild`, `insertBefore`, `replaceChild`,
   `append`, `prepend`, `before`, `after`, `replaceWith`, `replaceChildren`,
   `insertAdjacentElement`, `moveBefore`, `Range.insertNode`, `Range.surroundContents`, and the
   `document.body` setter) throws `NotSupportedError` when the node is, or holds, an `iframe`,
   `frame`, `object`, `embed`, `fencedframe` or `frameset`. A frame element outside a document has
   no window. The wrappers cannot be replaced. The check reads a node only through the native
   `nodeType`, `localName` and `querySelector` captured at start-up, never through the node's own
   properties, which page code could shadow (`Object.defineProperty(frame, 'nodeType', …)`), and it
   uses no `Array`, `Set` or `String` method that page code could replace. HTML parsers stay
   closed by Trusted Types.
2. `window.open()` and `document.open()` with three arguments return `null`, as a blocked pop-up does.
3. A second line, for a path not listed in 1: the `contentWindow` and `contentDocument` getters lock
   the frame's window (WebRTC removed, rules 1 to 3 applied there too) before they return it, and a
   `MutationObserver` locks and removes any frame element that appears.

The same lockdown runs on the thanks page, which imports `lockdown.ts` first too.

**`webrtc 'block'` is not added yet, to either policy.** Frames and pop-ups inherit their
creator's policy, so once browsers implement the directive, it closes WebRTC in every context at
once. Today it closes nothing, and Chromium logs a console error for it on every page that carries
it: on the start screen for every visitor (Lighthouse reports console errors), and after Start for
the photo step's policy (`tests/e2e/corners.spec.ts` rightly fails on any console error). A
directive that only adds an error is not worth it. Add it to `scripts/csp.ts` and
`src/security/intake-lockdown.ts` (with an ADR update) when a browser ships it.

**A canary test** (`tests/e2e/webrtc-frames.spec.ts`) tries 27 routes, including a frame that
shadows its own `nodeType` and built-ins replaced before the insertion, and reads each new window
through `window[i]`, which no getter guards. It fails if any of them opens
a peer connection with a data channel. It first runs the same routes in a page without the app and
requires the main ones to work there, so it cannot pass by testing nothing. Without rules 1 and 2,
20 of the first 24 routes reached WebRTC in the app; with them, none does. A first version that
read the node's own properties let the disguised frame and the replaced built-ins through (found
in review); the test now covers both.

## Consequences

- No tested route gives page code a working `RTCPeerConnection`, `RTCDataChannel` or
  `createDataChannel`, on the start screen or with photos loaded.
- A future feature that needs a frame or a pop-up will fail with `NotSupportedError`. Change this
  decision first.
- Each insertion now checks its node; a fragment or element with children is searched once with
  `querySelector`. The cost is small next to the rendering it precedes.
- Browser extensions run in their own JavaScript world, with their own prototypes, so their frames
  are not affected.
- **Limits, stated plainly.** `window[0]` and `window.frames` reach a frame's window without a getter
  that can be wrapped, and a `MutationObserver` runs after the code that caused the change. So rule 3
  is a second line, not a proof: what keeps a frame from existing is rule 1. HTML that the person
  pastes or drops into an editable area is inserted by the browser, not through these methods; the
  app has no editable area, and code would have to create one and wait for the person. As before,
  code already running in the page keeps the page's privileges: it can navigate the tab away. What
  keeps such code out is that only this build's verified code runs.
- Tests run in Chromium only. Firefox and Safari have the same DOM methods.
