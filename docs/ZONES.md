# How the DNI 4.0 redaction zones were measured

Data: `src/zones/dni.ts`. Source and method are repeated in that file's header.

1. Source: the official specimen image on the Policía Nacional site,
   <https://www.dnielectronico.es/img/Imagen_DNI_4.0.JPG> (823 × 580 px), linked from
   "Descripción DNI 4.0" (page version v.20260505). Retrieved 2026-11-24. No higher-resolution DNI 4.0
   specimen was found on the site; the "Fotografías" page only has DNI 3.0 and older images.
2. Card edges: per-column and per-row saturation profiles of the image. Front: x 74–330, y 211–372.5.
   Back: x 495.5–751.5, y 212–373.5. Both are 256 px wide; height follows the ID-1 ratio (85.60 / 53.98).
3. Fields: each side was cropped to those edges, scaled ×4 and read against a 5 % grid. Rectangles keep
   at least 1 % margin around printed text (one source pixel ≈ 0.4 % of the card width).
4. Check: the zones were drawn back on the specimen; every default-hidden field was fully covered.

## Findings worth a reviewer's attention

- The **issue date** is printed twice: in "EMISIÓN" and in the CLI laser image (`020621` = ddmmyy).
  Both are in the `issueDate` zone.
- The laser-engraved **clear window** (front top right, back top left, mirrored) carries a code that is
  illegible on the specimen. It looks like the support-number pattern, so it is hidden with
  `supportNumber` on both sides as a precaution.
- The **MRZ** repeats the support number, DNI number, date of birth, expiry date and full name.
- Left as visible (not in the spec's list): the vertical "EQUIPO" code on the back (issuing team) and
  the small DNI number top left on the front (the DNI number stays visible by design).

## To re-measure

Open the specimen in a browser, draw it into a canvas, crop to the card edges above and overlay a grid.
Any change to a rectangle needs a note in the zone's `note` field and an update to `retrieved`.
