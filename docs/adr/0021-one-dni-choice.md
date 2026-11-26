# 0021. One "DNI" choice: the version is detected, with 4.0 as fallback

- Status: accepted
- Date: 2026-11-26
- Changes: [0006](0006-document-types.md) (the picker), [0011](0011-document-detection.md) (what
  detection preselects)
- Decided by: Alexis ("consolidate DNI 4.0 and 3.0 in just DNI for the user; the split stays
  internal in the codebase")

## Context

The picker offered three documents: DNI 4.0, DNI 3.0 and TIE. Most people do not know which DNI
version they hold, and the hints ("EU flag on the front") ask them to look. The two DNI versions
are the same ID-1 card with the same fields; only the positions differ. Detection already tells the
versions apart in most cases: the MRZ dates give the issue date ([ADR 0011](0011-document-detection.md)),
and the front's printed text and the place of the DNI number fill in the rest
([ADR 0019](0019-ppocr-and-text-detection.md)). It cannot when the dates fit both versions and the
front text is unreadable, for a permanent DNI (holder 70 or over), or when OCR cannot run (offline
before the first download, an old browser).

## Decision

- The picker offers two choices: **DNI** and **TIE** (`DocChoice` in `src/zones/documents.ts`).
  Each DNI version keeps its own layout file (`src/zones/dni.ts`, `src/zones/dni-3.ts`), source
  and `DocModel` id (`dni-4.0`, `dni-3.0`).
- The DNI version comes from detection. When detection finds a DNI but not its version, or does not
  run, the app uses the DNI 4.0, the most common one today (`DEFAULT_DNI`). There is no error and no
  extra question.
- A DNI whose version is unknown is still preselected as **DNI**; the status line says the version
  could not be read and that the 4.0 layout is used.
- The editor shows a switch, **Older DNI (3.0)**, next to the box controls, for every DNI. When the
  version was not detected, a note under it says so. The switch changes only the layout: the
  straightened photos and the choices (hidden fields, watermark, black boxes) stay. Boxes moved by
  hand start over, as they belong to a layout.
- A manual choice still wins: picking DNI by hand before detection ends takes the version detection
  finds, but a version set with the switch is never overridden.
- The card guide has one DNI tab, with a 4.0/3.0 switch, because the elements differ by version.

## Alternatives

- **Keep three choices.** Rejected: it asks something most people cannot answer.
- **Ask the version only when detection fails.** Rejected: it brings the question back exactly when
  the person has the least help (offline). A wrong layout is visible at once in the editor and the
  switch fixes it in one tap.
- **Default to the DNI 3.0.** Rejected: the 4.0 has been issued since August 2021 and replaces each
  3.0 at renewal, so it is the better guess.

## Consequences

- One fewer decision before the editor. The person checks the boxes on the card, as before.
- With the wrong version and no check, boxes can sit off their fields. The editor already asks the
  person to check that each box covers its field; the note under the switch repeats it when the
  version is a guess.
- E2e tests reach the DNI 3.0 through the switch (`setDniVersion` in `tests/e2e/helpers.ts`).
