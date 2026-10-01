import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next/**', '.next-*/**', 'next-env.d.ts', 'src/lib/api/schema.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly', fetch: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', performance: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        process: 'readonly', URL: 'readonly', HTMLElement: 'readonly', HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly', Image: 'readonly', ResizeObserver: 'readonly', matchMedia: 'readonly',
        KeyboardEvent: 'readonly', PointerEvent: 'readonly', MouseEvent: 'readonly', Event: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
