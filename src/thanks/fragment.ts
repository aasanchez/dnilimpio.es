// SPDX-License-Identifier: AGPL-3.0-or-later
// Reads the session figures the app put in the thanks page's address fragment (src/stats/thanks-link.ts).
// Anything that is not exactly the fixed shape of src/stats/schema.ts is dropped: the page then has
// nothing to send. So a fragment can never carry anything else to the server, whoever wrote it.

import { parseSession, type SessionStats } from '../stats/schema.ts'

export function readFragment (hash: string): SessionStats | undefined {
  return parseSession(hash.startsWith('#') ? hash.slice(1) : hash)
}
