// SPDX-License-Identifier: AGPL-3.0-or-later
import { AUTONYMS, LANGS, dir, isLang, pickLang, t, type Lang } from './i18n/index.ts'
import { el } from './ui/dom.ts'
import { renderCapture, type CaptureState } from './ui/capture-screen.ts'
import { emptyAlignState, renderAlign, renderAlignResult, resetSide } from './ui/align-screen.ts'
import type { Side } from './zones/dni.ts'

type Step = 'capture' | 'align-front' | 'align-back' | 'align-result'

const state: CaptureState = { front: null, back: null }
const align = emptyAlignState()
/** Last bitmap the alignment was made for, per side: a new photo resets that side's corners. */
const alignedFor: Record<Side, ImageBitmap | null> = { front: null, back: null }
let step: Step = 'capture'
// The language choice lives in memory only (§2.2): it resets to the browser's language on reload.
let lang: Lang = pickLang(navigator.languages)
let controller = new AbortController()

function languageSelector (onChange: (l: Lang) => void): HTMLElement {
  const select = el('select', { id: 'lang' })
  for (const l of LANGS) {
    const option = el('option', { text: AUTONYMS[l] })
    option.value = l
    option.lang = l
    option.dir = dir(l)
    option.selected = l === lang
    select.append(option)
  }
  select.addEventListener('change', () => { if (isLang(select.value)) onChange(select.value) }, { signal: controller.signal })
  const label = el('label', { text: t(lang, 'language') })
  label.htmlFor = select.id
  return el('div', { className: 'lang' }, label, select)
}

/** Continue button under the capture step; enabled once both sides are loaded. */
function captureNext (go: (s: Step) => void): { element: HTMLElement; update: () => void } {
  const hint = el('p', { className: 'hint', id: 'capture-next-hint' })
  const next = el('button', { className: 'button', id: 'capture-continue', text: t(lang, 'continue') })
  next.type = 'button'
  next.setAttribute('aria-describedby', hint.id)
  const update = (): void => {
    const ready = state.front !== null && state.back !== null
    next.disabled = !ready
    hint.textContent = ready ? '' : t(lang, 'needBothSides')
  }
  update()
  next.addEventListener('click', () => { if (state.front && state.back) go('align-front') }, { signal: controller.signal })
  return { element: el('div', { className: 'actions' }, next, hint), update }
}

function stepView (go: (s: Step) => void): HTMLElement {
  const signal = controller.signal
  for (const side of ['front', 'back'] as const) {
    if (alignedFor[side] !== state[side]) {
      resetSide(align, side)
      alignedFor[side] = state[side]
    }
  }
  const front = state.front
  const back = state.back
  if (step === 'align-front' && front) {
    return renderAlign(lang, 'front', front, align, { onBack: () => { go('capture') }, onDone: () => { go(align.warped.back ? 'align-result' : 'align-back') } }, signal)
  }
  if (step === 'align-back' && back) {
    return renderAlign(lang, 'back', back, align, { onBack: () => { go('align-front') }, onDone: () => { go('align-result') } }, signal)
  }
  if (step === 'align-result' && align.warped.front && align.warped.back) {
    return renderAlignResult(lang, align, { onEdit: (side) => { go(side === 'front' ? 'align-front' : 'align-back') } }, signal)
  }
  step = 'capture'
  const next = captureNext(go)
  // The capture screen calls back whenever a side loads: re-evaluate the Continue button then.
  return el('div', {}, renderCapture(lang, state, next.update, signal), next.element)
}

function render (root: HTMLElement): void {
  controller.abort() // drop listeners from the previous render
  controller = new AbortController()
  document.documentElement.lang = lang
  document.documentElement.dir = dir(lang)
  document.title = t(lang, 'appTitle')
  const link = el('a', { text: t(lang, 'sourceCode') })
  link.href = __REPO_URL__
  link.rel = 'noopener noreferrer'
  root.replaceChildren(
    languageSelector((l) => {
      lang = l
      render(root)
      document.getElementById('lang')?.focus()
    }),
    el('h1', { text: t(lang, 'appTitle') }),
    el('p', { text: t(lang, 'tagline') }),
    stepView((s) => {
      step = s
      render(root)
      // Move focus to the new step's heading so screen readers announce it.
      const h = root.querySelector('h2')
      if (h) {
        h.tabIndex = -1
        h.focus()
        h.scrollIntoView({ block: 'start' })
      }
    }),
    el('footer', {}, link)
  )
}

const root = document.getElementById('app')
if (root) render(root)
