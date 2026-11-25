# 0006. Several document types, chosen by the user

- Status: accepted
- Date: 2026-11-25

## Context

The tool supported only the DNI 4.0. People also hold the older DNI 3.0, foreign residents hold a TIE,
and EU citizens living in Spain hold the green registration certificate with their NIE. The documents
place their fields differently, and the certificate is a paper card of 83 × 53 mm, not an ID-1 card.
The owner asked whether the type could be detected automatically.

## Decision

- Each document has its own zone file in `src/zones/` with its size in millimetres and an official
  source (Policía Nacional or PRADO). `src/zones/documents.ts` lists them.
- The straightened image size follows the document: 20 px per mm (1712 × 1080 for ID-1,
  1660 × 1060 for the certificate). The starting corner frame takes the document's shape.
- A **Document** screen after **Start** asks which document it is, with DNI 4.0 preselected. It is
  part of the Photos step in the progress bar. Back from the photo screen returns to it.
- Choosing another document keeps the photos but clears corners, straightened images and choices,
  because positions and fields differ. Leaving the screen without **Continue** changes nothing.
- Warnings only appear for fields the document has: the certificate has no CAN and no MRZ.

## Alternatives

- **Automatic detection only.** Offline detection is possible but not reliable for every pair yet.
  Certificate vs. card is easy (colour, shape, no MRZ). TIE vs. DNI needs the MRZ read by OCR (`IR`
  vs. `ID`), which is planned but not built. DNI 3.0 vs. 4.0 share the MRZ format and differ only in
  the front layout. A wrong guess would put the black boxes in the wrong places, so the manual
  choice stays, and detection will only preselect it later.
- **One generic layout with manual boxes only.** Simpler, but loses the one-tap field list, which is
  the main feature.
- **Full A4 sheet for the certificate.** Most holders carry the detached card. An uncut sheet still
  works: mark the corners of the card on it.

## Consequences

- Adding a document means one zone file, two dictionary keys (`doc_<id>`, `docHint_<id>`) and tests.
- Zone positions on the certificate are approximate (office printing); the editor's outlines and the
  "check that each box covers its field" hint carry that risk to the user.
