<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0014. Card guide: every element explained, every statement cited, nothing guessed

- Status: accepted
- Date: 2026-11-25

## Context

The app hides fields of an identity card, but did not say what those fields are or why hiding them
matters. The owner asked for an educational section that explains every element of each supported
card (DNI 4.0, DNI 3.0, TIE, including the card of a family member of an EU citizen), with one hard
rule: do not guess. Every statement must cite official documentation. Later the owner added that
each element should say briefly how bad actors can misuse it.

## Decision

- A **card guide** dialog, opened from the start screen ("What is on my card?") and from an ⓘ
  button beside every field switch in the editor, which opens that field's entry. A dialog keeps the
  editor exactly as it was.
- One tab per document. Entries grouped by front, back and chip. Each entry has two parts, **What it
  is** and **How it can be misused**, then one line on what the app does with it by default (taken
  from the zone data, so it cannot drift).
- Data, text and sources are separate and reviewable:
  - `src/guide/sources.ts`: the official sources, with publisher, edition, URL and the date read.
    Titles stay in their original language in every interface language.
  - `src/guide/entries.ts`: per document, the entries and, for each part, the citations with a
    pinpoint (article, annex point, section, page).
  - `src/guide/locales/<lang>.json`: the text, which says only what the cited passages say.
- **No source, no claim.** A part without citations shows "No official source found" instead of
  text. The unit test fails if an entry has no citation for what it is, unless it is listed in
  `UNSOURCED_WHAT` (empty since 2026-11-26, when the NIE got a source: the Interior ministry note
  published by La Moncloa, because Título XIII of Real Decreto 1155/2024 could not be read),
  and if any language fills in text that Spanish leaves empty.
- Sources used: Real Decreto 255/2025 (DNI; RD 1553/2005 for cards issued before 2 April 2025),
  Regulation (EU) 2025/1208, Regulation (EC) 1030/2002 (consolidated), ICAO Doc 9303 Parts 3 and 5
  and the ICAO technical report on TD1 layouts, the Policía Nacional DNIe portal and documents,
  PRADO ESP-BO-05001, and for misuse the AEPD and INCIBE.
- **Offline, no requests.** Citations are text. Links open in a new tab (`rel="noopener
  noreferrer"`), because leaving the page clears the photos. The text of one language loads when the
  guide opens, as its own chunk of the build, which the service worker precaches like the rest of
  the app.
- 13 languages. Spanish and English were written from the sources; the other 11 were machine
  translated, with titles of sources and words quoted from the card kept as published.

## Alternatives

- **Text only in the main dictionaries.** Rejected: about 140 strings per language would load with
  the first page for a screen most people open rarely.
- **A specimen image with numbered markers.** Deferred: the specimen images are not bundled, and
  placing markers needs measured positions for elements that are not redaction zones.
- **Fill gaps from general knowledge.** Rejected by the owner's rule.

## Consequences

- Adding a document or an element means adding citations first; the tests enforce it.
- Sources change (the DNI decree was replaced in 2025, the EU regulation in 2025). Each source shows
  the date it was read, and repealed ones are marked as such.
- Gaps are visible to users: today the misuse of several elements says that no official source was
  found.
