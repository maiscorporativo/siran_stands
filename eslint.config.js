import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // As funções `carregar()` chamadas nos effects são async e só alteram
      // estado depois do await — a regra não distingue esse caso do setState
      // síncrono que ela pretende evitar.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  }
);
