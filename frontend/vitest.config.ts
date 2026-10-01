import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig ใช้ jsx: preserve (ให้ Next คอมไพล์) — เทสต์ .tsx ต้องบอก esbuild ให้ใช้ JSX runtime อัตโนมัติเอง
  esbuild: { jsx: 'automatic' },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
  resolve: {
    alias: {
      '@/': `${resolve(__dirname, 'src')}/`,
      '@tower/engine/lang': resolve(__dirname, '../packages/engine/src/lang/index.ts'),
      '@tower/engine/types': resolve(__dirname, '../packages/engine/src/types.ts'),
      '@tower/engine/skill-text': resolve(__dirname, '../packages/engine/src/lang/skillText.ts'),
      '@tower/engine': resolve(__dirname, '../packages/engine/src/index.ts'),
    },
  },
});
