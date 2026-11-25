# 0008. Capture coach with classical image metrics

- Status: accepted
- Date: 2026-11-25

## Context

Most problems in later steps start with the photo: glare over the data, a blurred shot, a card that
is small or sloped in the frame. The owner asked for live tips while the photo is taken and an
automatic shot when the card is sharp. Rules from the owner: the tool works online first and
offline as an option, every feature works in both modes, a feature that cannot run turns itself
off and falls back to the manual path (never a random error), and photos never leave the device.

## Decision

- On phones and tablets, **Take photo** opens a live camera view (`getUserMedia`, rear camera,
  video only) with a guide frame in the ID-1 card shape.
- About 8 times per second, a 480 px greyscale copy of the frame is measured in plain TypeScript
  (`src/capture/coach.ts`), with no model:
  - framing: a straight edge near each side of the guide (share of strong-gradient pixels along
    the side, ±3 px tolerance); edges well inside the guide mean "move closer";
  - tilt: the slope of the top or bottom edge, measured near both ends;
  - light: mean luminance; glare: share of clipped pixels (≥ 250);
  - steadiness: mean difference from the previous frame;
  - sharpness: variance of the Laplacian, above a floor and within 80 % of the best value seen in
    the last 2.5 s (relative, so it adapts to each phone and card).
- One tip at a time, in that order. When all checks pass for 3 frames in a row, the coach takes the
  shot from the video frame at full resolution. After a shot it waits for the card to leave the
  frame or move a lot (the flip) before the next automatic shot, so one side is never saved as both.
- If the browser has no live camera, permission is refused, no camera exists, or the video does
  not start within 6 s, the view closes, a one-line note says why, and **Take photo** opens the
  system camera app as before. Desktop keeps **Choose image**, drag and drop and paste.
- Frames stay in memory. The camera stops when the view closes, both sides are done or the tab is
  hidden.

## Alternatives considered

- **A segmentation or detection model** (for example a small card detector). Better on messy
  backgrounds, but adds megabytes to download and cache, and a second code path for when the model
  is not cached. The metrics above cover the tips the owner listed. A model can come later as a
  separate feature ("Better edges"), reusing the same coach interface.
- **`ImageCapture.takePhoto()`** for full sensor resolution. Not available in Safari or Firefox;
  the video frame (up to 2560 × 1440) is enough for a card that fills the guide.

## Consequences

- Works the same online and offline: no network, no download.
- Thresholds are tuned on synthetic frames; real phones may need adjustments in `LIMITS`.
- The CSP needs no change: a `MediaStream` in `srcObject` is not a fetch.
