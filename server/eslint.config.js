import pluginJs from '@eslint/js'
import stylisticJs from '@stylistic/eslint-plugin-js'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import nodePlugin from 'eslint-plugin-n'

export default [
  pluginJs.configs.recommended,
  eslintPluginUnicorn.configs['flat/recommended'],
  nodePlugin.configs['flat/recommended'],
  {
    plugins: {
      '@stylistic/js': stylisticJs,
    },
    rules: {
      '@stylistic/js/semi': ['error', 'never'],
      '@stylistic/js/quotes': ['error', 'single'],
      '@stylistic/js/indent': ['error', 2],
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'n/no-unpublished-import': 'off',
      'unicorn/switch-case-braces': ['error', 'avoid'],
      'unicorn/prevent-abbreviations': 'off',
    }
  }
]