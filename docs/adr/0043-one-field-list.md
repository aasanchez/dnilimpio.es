<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0043. One field list for the switches and Find automatically

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis (asked why the field switches and the list of data **Find automatically** can
  look for did not match; chose "one list, split dates")

## Context

The editor had two lists of what to cover:

- The **field switches** came from the measured zones of each document (`src/zones/`): signature,
  issue date, expiry date, support number, CAN, MRZ, date of birth, place of birth, address, parents
  (DNI) and permit type (TIE).
- **Find automatically** ([ADR 0010](0010-smart-field-finding.md)) had its own chips, the same for
  every document: name, DNI/NIE number, dates, support number, CAN, MRZ.

The differences, and why:

| Item | Switches | Search | Reason |
|---|---|---|---|
| Name, DNI/NIE number | no | yes | Kept visible by design, so no zone was measured. OCR can still find them. |
| Dates | three switches | one "Dates" chip | Drift. The chip was on by default and covered the date of birth, which the switches leave visible by default. |
| Signature | yes | no | A signature is not text; OCR cannot find it. |
| Address, place of birth, parents, permit type | yes | no | Free text with no pattern to check. Finding them by their printed label is possible but not built. |

Two lists that look alike but differ confuse people, and the dates contradicted each other.

## Decision

- **One list.** The field ids of `src/zones/types.ts` are the only list. `FINDABLE` in
  `src/ocr/find.ts` names the fields the search can find, typed as field ids. The search has no
  chips: it covers what it finds of the fields switched to covered. Above the button the editor says
  which covered fields it looks for, and which ones only their fixed box covers.
- **Name and DNI/NIE number become fields**, visible by default, so they have a switch like the
  others. Their boxes were measured on the same official specimens as the other zones
  ([ZONES.md](../ZONES.md)): on the DNI 4.0 the number is printed twice on the front. On every card
  the back shows them only in the MRZ. They join `MRZ_REPEATS`, so hiding them while the MRZ stays
  visible shows the MRZ warning.
- **Dates are told apart.** The MRZ of either side holds the date of birth and the expiry date. A
  printed date equal to one of them, with a passing check digit, is that field. Any other date takes
  the date field of the layout where it is printed (the zone it overlaps most, else the nearest one),
  skipping fields the MRZ already placed. A date the layout cannot place is covered when any date
  field is covered, because covering too much is the safe side.
- The results are still ordinary undoable boxes (ADR 0010, 0011). Online first, offline optional: when
  OCR cannot run, the button is disabled with its reason, and the switches still cover every field.
- The usage stats ([ADR 0029](0029-opt-in-usage-stats.md)) do not count the two new fields. A data
  point holds at most 20 numbers, and the stats list is fixed by that record.

## Consequences

- The switches and the search always match; a change of one list cannot drift from the other.
- With the default switches, the search no longer covers the date of birth.
- Every document has two more switches: 12 fields with both sides, 8 with the front alone.
- Labels for the free-text fields (address, place of birth, parents, permit type) remain a possible
  later step; until then the list says the search does not look for them.
- Strings: two field names (moved from the search chips), three new lines under the button, and
  the MRZ warning now names the name and numbers too, in all 13 languages.
