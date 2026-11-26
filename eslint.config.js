// SPDX-License-Identifier: AGPL-3.0-or-later
// Code style: neostandard (maintained successor of standard / ts-standard), with TypeScript support.
// On top: typescript-eslint strict type-checked rules and project-specific security bans (§2, §5.1).
import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import svelteConfig from './svelte.config.js'

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'test-results/', 'playwright-report/'] },
  ...neostandard({ ts: true, noJsx: true, filesTs: ['**/*.ts', '**/*.svelte'] }),
  ...tseslint.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'svelte.config.js'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // §5.1: no eval / new Function / string-to-HTML sinks.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // `void promise` marks intentionally unawaited promises (typescript-eslint no-floating-promises).
      'no-void': ['error', { allowAsStatement: true }],
      'no-restricted-properties': ['error',
        { property: 'innerHTML', message: 'Use textContent / createElement (Trusted Types).' },
        { property: 'outerHTML', message: 'Use textContent / createElement (Trusted Types).' },
        { property: 'insertAdjacentHTML', message: 'Use createElement (Trusted Types).' },
        { object: 'document', property: 'write', message: 'Forbidden (Trusted Types).' },
        { object: 'localStorage', message: 'Nothing persists (§2.2).' },
        { object: 'sessionStorage', message: 'Nothing persists (§2.2).' },
        { object: 'indexedDB', message: 'Nothing persists (§2.2).' },
        // The same stores reached through a global object, and the other ways to keep or send data.
        ...['window', 'self', 'globalThis'].flatMap((object) => ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'openDatabase', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection'].map((property) => ({ object, property, message: 'Nothing persists and nothing is sent (§2.2).' }))),
        { object: 'document', property: 'cookie', message: 'No cookies (§2.2).' },
        { object: 'navigator', property: 'sendBeacon', message: 'Nothing is sent (§2.2).' },
        { object: 'navigator', property: 'storage', message: 'Nothing persists (§2.2).' },
        { object: 'window', property: 'open', message: 'No new windows with data in the URL.' },
      ],
      // The bare globals: storage and every API that sends data. Only the service worker may use
      // fetch() and Cache Storage (it caches the app's own files); see the override below.
      'no-restricted-globals': ['error',
        ...['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'caches'].map((name) => ({ name, message: 'Nothing persists (§2.2).' })),
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection'].map((name) => ({ name, message: 'Nothing is sent (§2.2): photos and data never leave the device.' })),
      ],
      'no-restricted-syntax': ['error',
        // Navigating to a URL built at run time could carry data in it.
        { selector: "AssignmentExpression[left.type='Identifier'][left.name='location']", message: 'No navigation to computed URLs (§2.2).' },
        { selector: "AssignmentExpression[left.object.name='location']", message: 'No navigation to computed URLs (§2.2).' },
        { selector: "AssignmentExpression[left.property.name='location']", message: 'No navigation to computed URLs (§2.2).' },
        { selector: "AssignmentExpression[left.object.property.name='location']", message: 'No navigation to computed URLs (§2.2).' },
        { selector: "CallExpression[callee.object.name='location'][callee.property.name=/^(assign|replace)$/]", message: 'No navigation to computed URLs (§2.2).' },
      ],
    },
  },
  {
    // The service worker downloads and caches the app's own files (fetch with integrity). Tests read
    // the stores to check they are empty, and the build and CI scripts run in Node.
    files: ['src/sw.ts', 'src/offline/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // The OCR worker reads its own model files from ocr/ with fetch(). Its CSP (workerCsp() in
    // src/offline/precache.ts) allows connections to ocr/ only, and the service worker answers only
    // this build's files, so nothing can leave the device from it.
    files: ['src/ocr/worker.ts'],
    rules: { 'no-restricted-globals': ['error', ...['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'caches', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection'].map((name) => ({ name, message: 'Only fetch() of ocr/ files is allowed here.' }))] },
  },
  {
    // The one exception to "nothing persists": the date the no-cookies notice was last closed
    // (one key, no personal data), so it shows at most every 4 days. Nothing else may use storage.
    files: ['src/ui/notice-memory.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // Numeric kernels index fixed-size arrays inside bounds-checked loops; with noUncheckedIndexedAccess
    // the alternative to `!` is a runtime check per pixel. Allowed only here and in tests.
    files: ['src/geometry/**/*.ts', 'src/engine/**/*.ts', 'src/detect/**/*.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser, svelteConfig } },
    rules: {
      // {@html} would bypass the no-HTML-strings rule (Trusted Types).
      'svelte/no-at-html-tags': 'error',
    },
  },
  { files: ['eslint.config.js', 'svelte.config.js'], ...tseslint.configs.disableTypeChecked }
)
