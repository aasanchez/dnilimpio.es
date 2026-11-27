// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { SHARE_SITE_URL, SHARE_TARGETS, opensNewTab, shareHref } from '../../src/engine/share-links.ts'

const message = 'Te envío mi documento (protected-document.pdf). ¿Vale? & más'
const subject = 'Documento con datos protegidos'

describe('shareHref', () => {
  it('builds each app link with the fixed message only', () => {
    const m = encodeURIComponent(message)
    const s = encodeURIComponent(subject)
    expect(shareHref('whatsapp', message, subject)).toBe(`https://wa.me/?text=${m}`)
    expect(shareHref('telegram', message, subject)).toBe(`https://t.me/share/url?url=${encodeURIComponent(SHARE_SITE_URL)}&text=${m}`)
    expect(shareHref('gmail', message, subject)).toBe(`https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${m}`)
    expect(shareHref('email', message, subject)).toBe(`mailto:?subject=${s}&body=${m}`)
  })

  it('encodes the text so it cannot add or change parameters', () => {
    for (const target of SHARE_TARGETS) {
      const url = new URL(shareHref(target, 'a&to=x@example.com#b', 'c&cc=y@example.com'))
      expect(url.hash).toBe('')
      expect([...url.searchParams.keys()].every((k) => ['text', 'url', 'view', 'fs', 'su', 'body', 'subject'].includes(k))).toBe(true)
    }
  })

  it('links only to the four apps and gives Telegram only the site address', () => {
    const hosts = SHARE_TARGETS.map((target) => new URL(shareHref(target, message, subject)))
      .map((u) => u.protocol === 'mailto:' ? 'mailto:' : u.host)
    expect(hosts).toEqual(['wa.me', 't.me', 'mail.google.com', 'mailto:'])
    expect(new URL(shareHref('telegram', message, subject)).searchParams.get('url')).toBe('https://dnitapado.es/')
  })

  it('opens web links in a new tab, because leaving the page clears the photos', () => {
    expect(SHARE_TARGETS.filter(opensNewTab)).toEqual(['whatsapp', 'telegram', 'gmail'])
  })
})
