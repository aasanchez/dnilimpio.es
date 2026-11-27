<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0031. Photo files checked by content, size and pixels before decoding

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis ("accept only JPEG, PNG, WebP and HEIC, checked by their first bytes rather
  than the file name, and cap file size and image dimensions")

## Context

The app has no server, so there is nothing to scan a file with an antivirus. A photo is only ever
decoded as an image by the browser (`createImageBitmap`), and the PDF is rebuilt from canvas pixels,
so no part of the file itself reaches the output. Two risks remain on the device:

- **Wrong type.** The old check trusted the MIME type and the file name, which the sender controls.
  Any format the browser can decode (GIF, BMP, AVIF, SVG in some cases) was accepted.
- **Decompression bomb.** A small file can declare a huge image: a PNG of under 100 bytes can say
  100 000 × 100 000 pixels, 40 GB once decoded. The browser may freeze or the tab may crash, which
  loses the session. The old 40 MB cap on the file did not catch this.

## Decision

Every photo goes through `inspect()` in `src/capture/decode.ts` before it is decoded. It reads only
the file's header (`src/capture/sniff.ts`):

1. **Size.** At most 25 MB (`MAX_BYTES`), checked from `File.size` before any byte is read. A 48 MP
   phone JPEG is about 10 to 20 MB; HEIC and WebP are smaller.
2. **Type by content.** The first bytes must be JPEG (`FF D8 FF`), PNG (its 8-byte signature),
   WebP (`RIFF…WEBP`) or HEIC (`ftyp` with an HEVC brand). The name and MIME type are ignored. AVIF,
   which uses the same container as HEIC, is refused.
3. **Pixels from the header.** At most 50 million pixels (`MAX_PIXELS`) and 16 384 pixels per side
   (`MAX_SIDE`). The size comes from the PNG `IHDR`, the WebP `VP8`/`VP8L`/`VP8X` header, the JPEG
   start-of-frame segment, or the largest HEIF `ispe` property. The JPEG walk reads only the 4-byte
   segment headers, so large EXIF or XMP segments are skipped, not loaded. A header that cannot be
   read is refused as "could not be opened".
4. **After decoding**, the bitmap's size is checked again (`checkBitmap`). This also covers frames
   from the live camera, which are made in the page and are not files.

The same check runs on every way in: file picker, camera input, drag and drop, and paste. Paste no
longer filters by MIME type: the first pasted file is checked like any other.

Each refusal has its own message in all 13 languages, with the limit in it (`errNotImage`,
`errTooLarge`, `errTooManyPixels`, `errHeic`, `errDecode`). The limits in the text come from the
constants, so text and code cannot drift. After a refusal the person can pick another photo; nothing
else changes.

**HEIC.** Only Safari 17 and later (macOS and iOS) can decode HEIC; Chrome, Edge, Firefox, Chrome
for Android and Samsung Internet cannot (caniuse, "HEIF/HEIC image format", checked 2026-11-27).
The file picker asks for `image/*`, so iOS usually hands over a JPEG copy of an HEIC photo anyway.
Where an HEIC file reaches a browser that cannot decode it, the type check passes, decoding fails,
and the person sees "This browser cannot open HEIC photos" with what to do. The app adds no HEIC
decoder: that would be a large new dependency (rule 11), and HEVC is patent-encumbered.

## Consequences

- A decompression bomb is refused before the browser allocates its pixels, on every way in.
- A file with a misleading name or MIME type is judged by what it is.
- Photos over 25 MB or 50 MP are refused. No common phone camera writes these by default; 200 MP
  modes do, and the message says to lower the resolution.
- GIF, BMP, AVIF, TIFF and SVG are no longer accepted, even where the browser could open them.
- Everything runs on the device, offline too, with no new dependency, network request or CSP change.
