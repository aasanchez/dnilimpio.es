// SPDX-License-Identifier: AGPL-3.0-or-later
// Links that open a messaging or mail app with a fixed message, for the done screen.
//
// None of these links can carry a file: wa.me, t.me, Gmail's compose page and mailto: accept only
// text. The PDF travels only through the system share sheet (Web Share with files), which the app
// hands the file to on the device. So the message is fixed, translated text that names the file;
// it holds no data from the document, and the app uploads the PDF nowhere to make a link.
// Opening a link is a navigation the user starts, not a request from the page: connect-src 'none'
// still holds.

/** Telegram's share page needs a URL to share; the site's own address is the only one we give. */
export const SHARE_SITE_URL = 'https://dnitapado.es/'

export type ShareTarget = 'whatsapp' | 'telegram' | 'gmail' | 'email'

/** Order on screen: messaging apps first, then mail. */
export const SHARE_TARGETS: readonly ShareTarget[] = ['whatsapp', 'telegram', 'gmail', 'email']

const enc = encodeURIComponent

/** The link for one target. `subject` is used by the mail targets only. */
export function shareHref (target: ShareTarget, message: string, subject: string): string {
  switch (target) {
    case 'whatsapp':
      return `https://wa.me/?text=${enc(message)}`
    case 'telegram':
      return `https://t.me/share/url?url=${enc(SHARE_SITE_URL)}&text=${enc(message)}`
    case 'gmail':
      return `https://mail.google.com/mail/?view=cm&fs=1&su=${enc(subject)}&body=${enc(message)}`
    case 'email':
      // The default mail app: Apple Mail on Apple devices, Outlook or another app elsewhere.
      return `mailto:?subject=${enc(subject)}&body=${enc(message)}`
  }
}

/** mailto: opens an app, not a page: no new tab. The web links open in a new tab (leaving clears the photos). */
export const opensNewTab = (target: ShareTarget): boolean => target !== 'email'
