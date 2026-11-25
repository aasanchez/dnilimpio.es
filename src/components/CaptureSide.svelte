<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { DecodeError, DecodeResult } from '../capture/decode.ts'
  import { wireCapture, type CaptureTarget } from '../capture/input.ts'
  import { t, type Key, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, side, bitmap, withCamera, onLoaded, register }: {
    lang: Lang
    side: Side
    bitmap: ImageBitmap | null
    withCamera: boolean
    onLoaded: (bitmap: ImageBitmap) => void
    register: (target: CaptureTarget) => void
  } = $props()

  const ERROR_KEY: Record<DecodeError['kind'], Key> = {
    'not-an-image': 'errNotImage',
    'heic-unsupported': 'errHeic',
    'too-large': 'errTooLarge',
    'decode-failed': 'errDecode',
  }

  let input: HTMLInputElement | undefined = $state()
  let cameraInput: HTMLInputElement | undefined = $state()
  let zone: HTMLElement | undefined = $state()
  let preview: HTMLCanvasElement | undefined = $state()
  // A message key, not text, so a language change re-translates it.
  let error = $state<Key | null>(null)
  const message = $derived(error ? t(lang, error) : bitmap ? t(lang, 'loaded') : '')

  function onResult (r: DecodeResult): void {
    if (!r.ok) {
      error = ERROR_KEY[r.error.kind]
      return
    }
    error = null
    onLoaded(r.bitmap)
  }

  $effect(() => {
    if (!input || !zone) return
    const ac = new AbortController()
    const target: CaptureTarget = cameraInput ? { input, cameraInput, dropZone: zone, onResult } : { input, dropZone: zone, onResult }
    wireCapture(target, ac.signal)
    register(target)
    return () => { ac.abort() }
  })

  // Small preview of the loaded photo.
  $effect(() => {
    if (!bitmap || !preview) return
    const scale = Math.min(1, 480 / bitmap.width)
    preview.width = Math.round(bitmap.width * scale)
    preview.height = Math.round(bitmap.height * scale)
    preview.getContext('2d')?.drawImage(bitmap, 0, 0, preview.width, preview.height)
  })
</script>

<div class="dropzone" bind:this={zone}>
  <h3>{t(lang, side)}</h3>
  <div class="buttons">
    {#if withCamera}
      <label class="button" for="camera-{side}">{t(lang, 'takePhoto')}<input bind:this={cameraInput} id="camera-{side}" class="visually-hidden" aria-describedby="status-{side}" /></label>
    {/if}
    <label class="button" for="file-{side}">{t(lang, 'choosePhoto')}<input bind:this={input} id="file-{side}" class="visually-hidden" aria-describedby="status-{side}" /></label>
  </div>
  <p class="hint">{t(lang, 'dropHint')}</p>
  <canvas class="preview" width="0" height="0" bind:this={preview}></canvas>
  <p class="status" id="status-{side}" role={error ? 'alert' : 'status'}>{message}</p>
</div>
