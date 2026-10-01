// ESLint ของ engine — กฎ recommended ของ typescript-eslint
// engine ถูกย้ายมาจาก Code Tower เดิมโดยไม่แก้โค้ดสักบรรทัด (docs/design-csmju-migration.md ข้อ 1)
// จึงปิดเฉพาะกฎที่ขัดกับรูปแบบที่ engine ตั้งใจใช้ พร้อมเหตุผลกำกับทุกข้อ
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'tools/**', 'test/pyshim/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
