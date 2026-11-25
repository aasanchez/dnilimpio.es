# 0006. Several document types, chosen by the user

- Status: accepted. The Document screen moved after the photos and gained detection: see [0011](0011-document-detection.md).
- Date: 2026-11-25

## Context

The tool supported only the DNI 4.0. Many people still hold the DNI 3.0, and foreign residents hold a
TIE. The documents place their fields differently. The owner asked whether the type could be detected
automatically. The EU citizen registration certificate (a printed paper card) was considered and left
out by the owner's choice.

## Decision

- Each document has its own zone file in `src/zones/` with its size in millimetres and an official
  source (Policía Nacional or PRADO). `src/zones/documents.ts` lists them.
- The straightened image size follows the document's size at 20 px per mm (1712 × 1080 for ID-1),
  and the starting corner frame takes its shape, so a document with another shape needs only data.
- A **Document** screen after **Start** asks which document it is, with DNI 4.0 preselected (no default since ADR 0011). It is
  part of the Photos step in the progress bar. Back from the photo screen returns to it.
- Choosing another document keeps the photos but clears corners, straightened images and choices,
  because positions and fields differ. Leaving the screen without **Continue** changes nothing.
- Warnings only appear for fields the document has (CAN, MRZ).

## Alternatives

- **Automatic detection only.** Offline detection is possible but not reliable for every pair yet.
  TIE vs. DNI needs the MRZ read by OCR (`IR` vs. `ID`), which is planned but not built. DNI 3.0 vs.
  4.0 share the MRZ format and differ only in the front layout. A wrong guess would put the black
  boxes in the wrong places, so the manual choice stays, and detection will only preselect it later.
- **One generic layout with manual boxes only.** Simpler, but loses the one-tap field list, which is
  the main feature.

## Consequences

- Adding a document means one zone file, two dictionary keys (`doc_<id>`, `docHint_<id>`) and tests.
