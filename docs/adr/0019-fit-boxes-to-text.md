# 0019. Fit to the text: ticked field boxes grow to cover the text OCR finds

- Status: accepted
- Date: 2026-11-26
- Builds on: [0010](0010-smart-field-finding.md), [0017](0017-ppocr-and-text-detection.md)
- Decided by: Alexis (asked whether the text detector's boxes could make the cover "more accurate"
  with manual selection; chose "Field boxes you tick (Datos tab)")

## Context

Field boxes come from one measured specimen per document (`src/zones/`). A real card can print a
field a little lower, or longer, than the specimen. The user can then move or resize each box by
hand (**Adjust boxes**), or add free boxes with smart field finding ([ADR 0010](0010-smart-field-finding.md)).
PP-OCRv6 ([ADR 0017](0017-ppocr-and-text-detection.md)) gives word boxes measured from the ink, so
the field boxes themselves can follow the text.

## Decision

- **Fit to the text**, a button under **Adjust boxes** in the Data tab, reads both straightened
  sides and grows the boxes of the fields the user ticked to hide. It runs only when the user taps
  it, and before the first OCR download it says the size, like smart field finding.
- `src/engine/snap.ts` (pure, unit tested) does the geometry, in normalised card coordinates:
  - A word belongs to a box when its centre lies within the box widened by 2 % of the card width
    and 15 % of the box height, and the word is at most 2.5 times as tall as the box.
  - Each word goes to the one box it is nearest to, among every field on that side, ticked or not.
    So a box does not grow over the next line or over a field that stays visible.
  - The box grows to take in its words plus a quarter of the word height. It never shrinks and grows
    by at most half its own size on each side, inside the card. Changes under 0.2 % are ignored.
  - Words with OCR confidence below 0.5 are ignored.
- The result is written to the same placement as a hand adjustment: **Adjust boxes** shows and
  edits it, and **Back to original position** undoes it. The user's own adjustments are the
  starting point, so fitting after a hand move grows the moved box.
- **Privacy.** `wordBoxesOnCard()` in `src/ocr/ocr.ts` returns word rectangles only. The text read
  is dropped there; it is not stored, logged or passed to the editor.
- When OCR cannot run (offline before the first download, no WebAssembly SIMD), the button is
  disabled with a one-line reason and the user adjusts the boxes by hand. With no field ticked, the
  button is disabled.

## Consequences

- On a card printed slightly off the specimen, one tap covers the whole value instead of leaving a
  sliver. The user still reviews the copy before downloading.
- A box can grow over a label printed right next to the value. Covering a little more is the safe
  error; the user can shrink it with **Adjust boxes**.
- Tapping again starts from the grown boxes; it changes nothing once the words are covered.
- Not measured on photos of real cards yet. A photo of a real card is never committed or quoted.
