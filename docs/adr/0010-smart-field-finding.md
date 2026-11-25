# 0010. Smart field finding from OCR text

- Status: accepted
- Date: 2026-11-25
- Decided by: Alexis ("Smart field finding: OCR reads where the name, number and dates are, so it can
  mask them on any document, even layouts we haven't measured. Separate PR.")

## Context

Field positions come from measured specimens (`src/zones/`). A card printed slightly differently, or
a layout we have not measured, leaves data uncovered unless the user draws boxes by hand. On-device
OCR ([ADR 0009](0009-on-device-ocr.md)) gives words with their positions, so the app can find the
data from what the text says.

## Decision

- `src/ocr/find.ts` (pure, unit tested) turns OCR words into found items with normalised rectangles.
  Kinds: name, DNI/NIE number, date, support number, CAN, MRZ line.
  - A DNI/NIE number counts only when its check letter is right; a date only when it is a real
    calendar day. These checks are what make a match trustworthy without knowing the layout.
  - Support numbers and the CAN count only with OCR confidence of at least 0.5, and the CAN only as
    six digits alone on their line.
  - Names come from the MRZ of either side (its third line) and from the line under a name label
    (`APELLIDOS`, `NOMBRE`, and their English and Catalan forms).
  - Each rectangle is the union of the matched words, grown by a quarter of the text height on each
    side (at least 0.5 % of the card width).
- **Find automatically**, in the editor's Data tab, reads both straightened sides and adds a box for
  each item of the kinds the user picked. Dates, support number, CAN and MRZ are picked by default,
  matching the fields hidden by default; name and number are not, because the person receiving the
  copy usually needs them.
- Results become ordinary manual boxes in one history step: the user sees them, moves or deletes
  them, and one **Undo** removes them all. A result that overlaps an existing box by more than half
  is skipped. Smart find adds coverage; it never removes a field mask.
- Online first, offline optional: the button is disabled, with a one-line reason, whenever
  `ocrStatus()` says OCR cannot run (offline before the first download, no service worker, no
  WebAssembly). A failure during the run shows "did not work this time, hide the data by hand". No
  raw error reaches the user. The manual path is always there.

## Consequences

- Works on layouts we have not measured, as long as the text is legible.
- OCR can miss text (glare, blur, small print), so results are a help, not a guarantee; the review
  step and the fields list stay in place.
- New strings: 14 keys in every language.
