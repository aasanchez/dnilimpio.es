# 0011. Document type detected from the MRZ, after the photos

- Status: accepted
- Date: 2026-11-25
- Changes: [0006](0006-document-types.md) (screen order)

## Context

The owner asked for automatic detection of the document type. [ADR 0006](0006-document-types.md)
kept a manual picker and planned detection as a preselect once OCR existed. On-device OCR
([ADR 0009](0009-on-device-ocr.md)) and card edge detection are now merged.

Detection needs the photos, but the picker came before them.

## Decision

- **Order:** Start → Photos → **Document** → Corners. The Document screen is still part of the
  Photos step in the progress bar. Back from the corners returns to it; changing the document keeps
  the photos and clears corners and choices, as before.
- **Method** (`src/detect/`), for the back photo first, then the front (in case they were swapped):
  1. Find the card outline (edge detection) and straighten it to 1712 × 1080.
  2. Read the bottom 40 % with OCR (MRZ characters only), at two sizes; then the card upside down.
     Without an outline, read the whole photo. Keep the first read whose check digits all pass, or
     else the one with the most passing check digits.
  3. Classify (`doc-type.ts`, pure): issuing state `ESP` and code `IR` → TIE; code `ID` → DNI.
     The DNI version comes from the issue date, inferred from the dates of birth and expiry
     (validity 2/5/10 years by age at issue, Real Decreto 1553/2005 art. 6; the expiry may fall on
     the issue day or the next birthday, so the issue date is a one-year range). Range entirely from
     2 August 2021 → DNI 4.0; entirely from 2015 to before that day → DNI 3.0. Otherwise, or when a
     date check digit fails, or for a permanent DNI: "it is a DNI, choose the version".
- **No default.** Until detection answers or the person picks, no document is selected and
  **Continue** is off. (A DNI 4.0 default made a real TIE get DNI boxes, 2026-11-25.)
- **It only preselects.** The person confirms with **Continue**. A radio the person picked is never
  changed, and once a document is confirmed for these photos, returning to the screen does not
  change it. A new photo allows a new preselect.
- **Online and offline** follow `ocrStatus()`:
  - `ready` (OCR files cached): detection runs by itself.
  - `download` (online, not cached): the files download by themselves (8 MB, once) and the status
    line says so. Changed on 2026-11-25: a tap-to-download button let a real TIE go through with the
    DNI 4.0 default.
  - `unavailable` (offline before the first download, no service worker, old browser): a note says
    so, and the picker works as before.
  - Any failure while reading ends in "could not recognise the document, choose it". No error
    reaches the screen.
- The detection code is its own chunk, loaded when the Document screen opens. Results are kept per
  photo in memory (a `WeakMap`), so going back and forth does not read the same photo twice.

## Alternatives

- **Front layout (EU flag on the DNI 4.0).** Needs a reliable colour/shape detector for a small
  area and fails on greyscale or poorly lit photos. Not needed while the dates decide most cases;
  can be added later for the ambiguous ones.
- **Picker before the photos, with a suggestion after.** Keeps the old order but asks the question
  before the answer is known, and the suggestion would come on another screen.
- **Detection without confirmation.** A wrong guess puts the black boxes in the wrong places.

## Consequences

- The first detection costs an 8 MB download (shared with smart field finding). Later ones take a few seconds on a phone.
- Synthetic tests prove the pipeline (straighten, crop, read, classify). Accuracy on real photos of
  real cards depends on the OCR, which is not trained on the MRZ font (OCR-B). The confirmation step
  and the fallbacks cover misreads.
