# How the redaction zones were measured

One file per document in `src/zones/`; each file's header repeats its source and method.

| Document | Data | Source | Shape |
|---|---|---|---|
| DNI 4.0 | `dni.ts` | Policía Nacional specimen | ID-1, 85.60 × 53.98 mm |
| DNI 3.0 | `dni-3.ts` | PRADO ESP-BO-05001 | ID-1 |
| TIE (2020 model) | `tie.ts` | PRADO ESP-HO-03001 | ID-1 |

[PRADO](https://www.consilium.europa.eu/prado/en/prado-start-page.html) is the Council of the EU's
public register of identity documents; its entries are compiled by each country's document experts.
Straightened images are 20 px per mm: 1712 × 1080 for ID-1. Each zone file states its document's size,
so a document with another shape needs no engine change.

## DNI 4.0

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
- Left as visible (not in the spec's list): the vertical "EQUIPO" code on the back (issuing team).
- **Name and DNI number** (added 2026-11-27, [ADR 0043](adr/0043-one-field-list.md)), visible by
  default. The number is printed twice on the front: "DNI 99999999R" at the top and a small copy top
  left. The surnames take two lines and the name one, under their labels; the boxes reach 78 % of
  the width for long names. The back shows the name and number only in the MRZ.

## DNI 3.0

1. Source: PRADO ESP-BO-05001 ("DOCUMENTO NACIONAL DE IDENTIDAD", first issued 2 January 2015),
   specimen "Carmen Española Española". Front 600 × 381 px, back 600 × 379 px, both already cropped to
   the card. Retrieved 2026-11-25.
2. Fields read against a 5 % grid, then drawn back on the specimen to check coverage.

Findings:

- The front has **no "EMISIÓN" field**. The issue date appears only as laser text beside the small
  ghost photo (`010115` = ddmmyy); that text is the `issueDate` zone.
- The **support number** ("NUM SOPORT") also appears in the clear window, top right on the front and
  mirrored top left on the back. Both are in `supportNumber`.
- The address, place of birth and parents' zones are wider than the specimen text, for long names.
- **Name and DNI number** (added 2026-11-27): the number is printed once on the front, bottom left
  under the photo ("DNI 99999999R"). The surnames (two lines) and the name sit under their labels;
  the boxes reach 72 % of the width, short of the "ESPECIMEN" area. The back shows them only in the
  MRZ.

## TIE (Tarjeta de Identidad de Extranjero)

1. Source: PRADO ESP-HO-03001 ("PERMISO DE RESIDENCIA", first issued 19 May 2020), specimen "Muestra
   Sample Carmen". Front image 600 × 386 px with the card at x 5.5–587.5, y 9–376 (brightness profiles);
   back is the "Substrate" image of the same entry, card at x 11–593, y 5–373.5. Retrieved 2026-11-25.
2. PRADO lists the format as 88 × 54 mm, but the measured ratio is 1.58, the ID-1 ratio. The tool uses ID-1.

Findings:

- The **card number** (`E00000000`, the support number) is printed twice on the front: top right and
  below the coat of arms. It is repeated in the MRZ.
- **Permit type** ("TIPO DE PERMISO", e.g. long-term residence, authorised to work) is a new optional
  field, visible by default. Some people may not want to show their immigration status.
- The **issue date** is on the back ("FECHA DE EMISIÓN"); the place of issue next to it stays visible.
- **Name and NIE** (added 2026-11-27), visible by default. The surnames and name take three lines
  under "APELLIDOS Nombres"; the box stops left of the small ghost photo. The NIE is printed once on
  the front ("NIE:X1234567P", right of "NIE / PERSONAL NUMBER"). The back shows both only in the MRZ.
- **Checked on a real card (2026-11-25).** A permanent residence card of a family member of an EU
  citizen ("TARJETA DE RESIDENCIA PERMANENTE", permit type "REGIM COMUNITARIO", "Residence card of a
  family member of a Union citizen") uses the same 2020 layout; only the title and the permit text
  differ. The dates of birth and expiry and the second card number reached up to about 2 % beyond the
  specimen boxes, so those boxes were widened. The card is not stored anywhere.
- PRADO lists one 2020 model for every TIE title (temporary or long-term residence, EU family member,
  students, workers); the title and permit lines change. Report a card whose fields sit elsewhere.
- Earlier TIE models (PRADO ESP-HO-02xxx) are not covered; they were replaced in 2020 and their
  5-year validity has ended.

## To re-measure

Open the specimen in a browser, draw it into a canvas, crop to the card edges given for that document
and overlay a 5 % grid. Draw the zones back on the specimen to check that every field is covered.
Any change to a rectangle needs a note in the zone's `note` field and an update to `retrieved`.
