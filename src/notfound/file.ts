// SPDX-License-Identifier: AGPL-3.0-or-later
// The not-found page's file name (ADR 0045), in a module with no import: the service worker uses it
// (src/offline/precache.ts), and its script may share no code with the app's.

/** File name of a not-found page, in each folder that has one. */
export const NOT_FOUND_FILE = '404.html'
