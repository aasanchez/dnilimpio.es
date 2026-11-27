<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0047. Hand-moved cover boxes in the opt-in usage stats

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (asked to send the new place of boxes moved by hand, to make the default
  boxes more accurate; chose "0.5% steps, no default")
- Amends: [ADR 0029](0029-opt-in-usage-stats.md), point 4 (the fixed list)

## Context

Each document type has a default cover box for each field, measured on official specimens
([`docs/ZONES.md`](../ZONES.md)). Real cards and photos differ a little from the specimens. When a box
is off, people move or resize it by hand (**Adjust boxes**). Those corrections are the best evidence
of where the defaults should be, but they stay on the device.

The opt-in stats of ADR 0029 send only ids, yes/no answers and small counts. ADR 0029 and rule 1 of
`CLAUDE.md` said a row never carries a position.

## Decision

The stats list gets one key, `moved`. It lists each cover box that was moved or resized by hand:

- **Shape.** One entry `field-box-x-y-w-h` per box, separated by commas, for example
  `moved=can-0-124-142-60-18`. `field` is a field id of the fixed list (`FIELDS`), `box` is the
  box's number among all of that field's boxes, in zone order, front and back (0 to 9). So the
  support number, printed on both sides of the DNI, gets a different number on each. `x`, `y`, `w` and `h` are the box's left edge, top edge,
  width and height.
- **Unit.** Steps of 0.5% of the straightened card (`MOVED_STEPS` = 200 per side), from its top-left
  corner. On an ID-1 card one step is about 0.43 mm across and 0.27 mm down. Values are rounded and
  kept between 0 and 200.
- **Which boxes.** Only boxes moved or resized by hand (**Adjust boxes**). A box placed by **Fit to
  the text** is left out: it follows the words that OCR read, so it would say more about the text
  and nothing about the defaults (`EditState.handPlaced`). Only boxes of fields that were covered, and only fields of the fixed list: never
  the name or the DNI/NIE number (ADR 0043). A box whose steps equal its default's is left out. At
  most 20 entries (`MAX_MOVED`); a document has at most 14 boxes.
- **Not sent.** The default box it replaced: it is fixed by `doc` and `app` (the zones of that
  build), which the row already holds, so each query can rebuild it. No pixel position, no photo
  size, nothing read from the image. Extra black boxes drawn by hand still count only as a number
  (`boxes`).
- **One spelling.** Entries are in field order, then box number, each once. `parseStats()` rejects
  any other order, a repeat, a field that was not covered, a value out of range and anything that is
  not a whole number.
- **Storage.** `blob12` holds the `moved` text and `double20` the number of entries. The list
  version (`v`, `blob1`) goes from 1 to 2.
- **Size.** The body cap (`MAX_STATS_LENGTH`) goes from 600 to 1,200 bytes. The longest valid text,
  with 20 entries, fits (a unit test checks it). Workers Analytics Engine allows 20 blobs, 20 doubles
  and 16 KB of blobs per row.

The thanks page shows `moved` with the rest of the text before the tap, and its lead text in all 13
languages says that it holds where the person moved the boxes on the card.

## Consequences

- Alexis can compare, per document type and build, the boxes people moved with the defaults, and
  tune `src/zones/` from real cards.
- A small new risk: a box fitted tightly around printed text shows roughly how long that text is
  (for example a short or a long address). The text itself is never sent, the row has no identifier,
  and the person sees the exact text before sending. Coarser steps (1%) were offered and not chosen.
- The row now holds a position, so rule 1 of `CLAUDE.md`, ADR 0029, the README and the audit prompt
  say "no position on the photo" instead of "no position".
- Every number column of the row is used. A new number must go in a text column, or replace one.
- Rows of list version 1 (before this change) have no `blob12` or `double20`. Queries that read them
  filter on `blob1 = '2'`.
