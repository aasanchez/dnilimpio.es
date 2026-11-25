# 0012. Automatic straightening: find, turn and straighten both photos; corners only on request

- Status: accepted
- Date: 2026-11-25
- Changes: [0011](0011-document-detection.md) (screen order), [0007](0007-corner-model.md) (where the
  corner finder runs)

## Context

The owner asked that the app "automatically rotate and detect borders, and let the user decide if
they need any extra manual adjustments". Until now the corner screen opened for each side after the
document choice. The corner finder ([ADR 0007](0007-corner-model.md): model, then classic edge
detection) only pre-placed the corners; the person had to check them and press Continue twice.

A corner finder gives the card's outline, not which way up the card is. A photo taken sideways or
upside down came out sideways or upside down unless the person used **Rotate**.

## Decision

- **Order:** Start → Photos → Document → **Straighten (automatic)** → Hide → Download. The corner
  screen opens only:
  - for a side whose card was not found ("We could not find the document in this photo. Place the
    corners by hand."),
  - when the person taps **Place the corners myself** while straightening runs, or
  - from **Adjust corners** in the editor, which shows the corners that were found.
- **Method** (`src/detect/auto-align.ts`), per side, front then back:
  1. Find the corners: the model when it is available within 10 s, else classic edge detection
     (`corners.ts`, unchanged order and fallbacks). Then snap each side onto the card's real
     edge nearby (`refine.ts`, added after a real TIE on dark fabric came out with its top and
     bottom about 7 % outside the card): every line within 12 % of the card's size is scored by
     the mean brightness step across it; among lines at least 75 % as strong as the best, the
     outermost wins (a band printed along the border lies inside it), then a finer search finds
     its peak. No clear step, or crossing lines in odd places, keep the detector's corners.
  2. **Sideways:** turn the outline so its long edge is horizontal (`landscape`, as before).
  3. **Upside down** (`upright.ts`, pure): straighten a small copy (428 px wide) and compare the
     "ink" (darkness plus fine detail) in the side's **anchor** box with the ink in the same box
     turned 180°. The anchor is the largest dark block at a known place: the holder's photo on the
     front (`portrait` in the zone data, left), the machine-readable zone on the back (bottom). Turn
     only when the turned box holds clearly more ink (12 grey levels); otherwise keep the card as
     found, because most photos are taken upright.
  4. Straighten to 1712 × 1080 and open the editor.
- **Online and offline:** the same as ADR 0007. Without the model, edge detection answers; when
  neither finds the card, that side goes to the manual corner screen. No error reaches the screen.
- Going back from the editor to the Document screen and continuing with the same document keeps
  the straightened cards; another document straightens again.

## Alternatives

- **Orientation from OCR (MRZ on the back, text on the front).** Reliable, but it needs the 8 MB OCR
  download ([ADR 0009](0009-on-device-ocr.md)) and several seconds per side. The ink check is
  instant and works offline; OCR stays for document detection.
- **Field zones instead of one anchor.** Tried first: mean detail inside all field zones against
  outside. Thin text on a patterned background gave a weak, unstable signal; one large block is
  clearer.
- **Always show the corner screen with the found corners.** The previous behaviour; two extra taps
  for the common case.

## Consequences

- The common case is Photos → Document → editor, with no corner screen.
- The `portrait` boxes are deliberately smaller than the photo on the specimens, so a small
  measurement error keeps them inside. Validation is on synthetic photos only (upright, 90°, 180°,
  270°, and cluttered backgrounds). A real card with an unusually light photo, or strong glare, may
  stay upside down; **Adjust corners** → **Rotate** fixes it.
