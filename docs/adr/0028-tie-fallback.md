<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0028. TIE preselected when detection runs but cannot tell the document

- Status: accepted
- Date: 2026-11-27
- Changes: [0011](0011-document-detection.md) (the "no default" rule)
- Decided by: Alexis ("when detection of the type of card fails, select TIE. The DNI detection is
  spotless, TIE fails sometimes, so when it fails it is usually a TIE, and the user can change the
  selected radio button anyway"; then "no preselect when the AI detection is not available, only
  when it fails, which is different")

## Context

[ADR 0011](0011-document-detection.md) left the picker empty until detection answered or the person
chose, and kept **Continue** off. That rule came from a real TIE that got DNI boxes from a DNI 4.0
default. Since then, detection reads both the MRZ and the front's printed text
([ADR 0019](0019-ppocr-and-text-detection.md)). In use, DNI detection is reliable; the TIE is the
card that detection sometimes misses. So when detection has no answer, the card is most likely a TIE.
An empty picker then only adds a tap, and the person still has to know which card they hold.

When detection does not run at all, nothing says the card is a TIE: the photos were not read.

## Decision

- When detection reads the photos and finds no answer (no MRZ read and no front text that tells
  the card), the picker preselects **TIE** (`FALLBACK_CHOICE` in `src/zones/documents.ts`).
- When detection does not run, nothing is preselected and **Continue** waits for a choice, as in
  [ADR 0011](0011-document-detection.md). This covers no OCR (offline before the first download, no
  service worker, an old browser) and OCR that cannot start (for example, the connection drops
  during the download).
- The status line says so: *TIE is selected. If it is a DNI, change it.* The note goes when the
  person picks DNI.
- While the photos are read, nothing is selected and **Continue** stays off, so a detected DNI is
  never taken as a TIE by a quick tap.
- A radio the person picked is never changed, also by the fallback. A confirmed document is kept
  when the person returns to the screen, as before.
- A DNI found without its version still preselects DNI with the 4.0 layout
  ([ADR 0021](0021-one-dni-choice.md)).

## Alternatives

- **Keep no default.** Safe, but it asks for a choice in the case where the answer is most likely
  TIE, and the person can still pick wrong.
- **Default to DNI.** This is what made a real TIE get DNI boxes (2026-11-25).

## Consequences

- A DNI that detection misses gets TIE boxes until the person changes the choice. The status line
  says TIE was chosen, and the editor shows the document name.
- No new file, request or storage. Offline with OCR cached, the fallback works as online; offline
  without OCR, the picker stays empty.
