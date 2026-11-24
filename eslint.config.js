// SPDX-License-Identifier: AGPL-3.0-or-later
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['eslint.config.js'] }, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // §5.1: no eval / new Function / string-to-HTML sinks.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
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
  { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked },
);
