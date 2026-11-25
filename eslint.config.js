// SPDX-License-Identifier: AGPL-3.0-or-later
// Code style: neostandard (maintained successor of standard / ts-standard), with TypeScript support.
// On top: typescript-eslint strict type-checked rules and project-specific security bans (§2, §5.1).
import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'test-results/', 'playwright-report/'] },
  ...neostandard({ ts: true, noJsx: true }),
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['eslint.config.js'] }, tsconfigRootDir: import.meta.dirname } },
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
      ],
    },
  },
  {
    // Numeric kernels index fixed-size arrays inside bounds-checked loops; with noUncheckedIndexedAccess
    // the alternative to `!` is a runtime check per pixel. Allowed only here and in tests.
    files: ['src/geometry/**/*.ts', 'src/engine/**/*.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked }
)
