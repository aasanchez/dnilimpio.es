// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Dictionary } from './index.ts';

export const en: Dictionary = {
  appTitle: 'Clean DNI',
  tagline: 'Hide the sensitive data on your DNI before sharing a copy. Everything happens on your device: nothing is sent.',
  sourceCode: 'Source code',
  stepCapture: 'Step 1 of 6: add the photos of your DNI',
  front: 'Front (side with the photo)',
  back: 'Back (side with the lines of text at the bottom)',
  chooseOrTake: 'Take a photo or choose an image',
  dropHint: 'You can also drag the image here or paste it with Ctrl+V.',
  loaded: 'Image loaded.',
  errNotImage: 'The file is not an image. Use a JPEG, PNG or HEIC photo.',
  errHeic: 'This browser cannot open HEIC photos. Take a screenshot of the photo or convert it to JPEG on your device.',
  errTooLarge: 'The image is too large (maximum 40 MB).',
  errDecode: 'The image could not be opened. Try another photo.',
};
