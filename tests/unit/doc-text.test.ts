// SPDX-License-Identifier: AGPL-3.0-or-later
// Lines below copy the specimens' printed labels (docs/ZONES.md). Personal data is fictional.
import { describe, expect, it } from 'vitest'
import { classifyText, combine, fuzzyContains, normalise } from '../../src/detect/doc-text.ts'

const DNI_4 = [
  { text: 'REINO DE ESPAÑA', y: 0.08 },
  { text: 'DOCUMENTO NACIONAL DE IDENTIDAD', y: 0.13 },
  { text: 'DNI 99999999R', y: 0.2 },
  { text: 'APELLIDOS', y: 0.3 },
  { text: 'EMISIÓN VALIDEZ', y: 0.62 },
  { text: 'NUM SOPORTE', y: 0.7 },
  { text: 'NATIONAL IDENTITY CARD / DOCUMENTO NACIONAL IDENTIDAD', y: 0.95 },
]

const DNI_3 = [
  { text: 'ESPAÑA DOCUMENTO NACIONAL DE IDENTIDAD', y: 0.1 },
  { text: 'APELLIDOS', y: 0.3 },
  { text: 'NUM SOPORT VALIDEZ', y: 0.72 },
  { text: 'DNI 99999999R', y: 0.92 },
]

const TIE = [
  { text: 'ESP PERMISO DE RESIDENCIA E00000000', y: 0.08 },
  { text: 'APELLIDOS Nombres / SURNAMES Forenames', y: 0.22 },
  { text: 'TIPO DE PERMISO / TYPE OF PERMIT VALIDEZ TARJETA / CARD EXPIRY', y: 0.47 },
  { text: 'NIE:X1234567L', y: 0.7 },
  { text: 'RESIDENCE PERMIT / TITRE DE SEJOUR', y: 0.92 },
]

describe('normalise', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalise('Reino de España / Emisión:')).toBe('REINO DE ESPANA EMISION')
  })
})

describe('fuzzyContains', () => {
  it('finds a phrase with a few misreads, anywhere in the line', () => {
    expect(fuzzyContains('XX PERMIS0 DE RESIDENCJA YY', 'PERMISO DE RESIDENCIA', 3)).toBe(true)
    expect(fuzzyContains('TARJETA SANITARIA', 'TARJETA DE RESIDENCIA', 3)).toBe(false)
  })
})

describe('classifyText', () => {
  it('recognises each specimen front', () => {
    expect(classifyText(DNI_4)).toEqual({ kind: 'dni', model: 'dni-4.0' })
    expect(classifyText(DNI_3)).toEqual({ kind: 'dni', model: 'dni-3.0' })
    expect(classifyText(TIE)).toEqual({ kind: 'tie', model: 'tie' })
  })

  it('survives OCR misreads', () => {
    const noisy = [{ text: 'PERMlSO DE RESlDENClA' }, { text: 'RESIDENCE PERMlT' }]
    expect(classifyText(noisy)).toEqual({ kind: 'tie', model: 'tie' })
  })

  it('says DNI without a version when only the title is read', () => {
    expect(classifyText([{ text: 'DOCUMENTO NACIONAL DE IDENTIDAD' }])).toEqual({ kind: 'dni', model: null })
  })

  it('uses the position of the DNI number only when it is known', () => {
    const title = { text: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
    expect(classifyText([title, { text: 'DNI 99999999R', y: 0.15 }])).toEqual({ kind: 'dni', model: 'dni-4.0' })
    expect(classifyText([title, { text: 'DNI 99999999R', y: 0.9 }])).toEqual({ kind: 'dni', model: 'dni-3.0' })
    expect(classifyText([title, { text: 'DNI 99999999R' }])).toEqual({ kind: 'dni', model: null })
  })

  it('ignores an invalid number and the MRZ', () => {
    const title = { text: 'DOCUMENTO NACIONAL DE IDENTIDAD' }
    expect(classifyText([title, { text: 'DNI 99999999A', y: 0.9 }])).toEqual({ kind: 'dni', model: null })
    expect(classifyText([title, { text: 'IDESPBAA0005896 99999999R<<<<<<', y: 0.9 }])).toEqual({ kind: 'dni', model: null })
  })

  it('returns null for text that says too little', () => {
    expect(classifyText([])).toBeNull()
    expect(classifyText([{ text: 'APELLIDOS NOMBRE SEXO' }])).toBeNull()
    expect(classifyText([{ text: 'CARD EXPIRY' }])).toBeNull()
  })
})

describe('combine', () => {
  const dni = { kind: 'dni', model: null } as const
  const dni4 = { kind: 'dni', model: 'dni-4.0' } as const
  const dni3 = { kind: 'dni', model: 'dni-3.0' } as const
  const tie = { kind: 'tie', model: 'tie' } as const

  it('keeps a model the MRZ named', () => {
    expect(combine(dni3, dni4)).toEqual(dni3)
    expect(combine(tie, dni4)).toEqual(tie)
  })
  it('lets the text fill in the DNI version', () => {
    expect(combine(dni, dni4)).toEqual(dni4)
  })
  it('keeps the MRZ kind when the two disagree', () => {
    expect(combine(dni, tie)).toEqual(dni)
  })
  it('uses the text alone when no MRZ was read', () => {
    expect(combine(null, tie)).toEqual(tie)
    expect(combine(null, null)).toBeNull()
  })
})
