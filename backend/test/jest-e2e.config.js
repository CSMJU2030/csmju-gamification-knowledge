/**
 * e2e — ต้องมี PostgreSQL จริง (ตั้ง TEST_DATABASE_URL) · ไม่อยู่ใน `pnpm -r test` ของ CI
 * เพราะ job Code Quality ของมาตรฐานไม่มีฐานข้อมูล · รันเองด้วย `pnpm --filter backend test:e2e`
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  moduleNameMapper: { '^@tower/engine$': '<rootDir>/../packages/engine/src/index.ts' },
  testEnvironment: 'node',
  testTimeout: 60000,
};
