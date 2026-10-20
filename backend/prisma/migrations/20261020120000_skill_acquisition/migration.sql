-- วิธีได้สกิลระยะ S2–S4 (docs/design-skill-acquisition.md ข้อ 8)
-- เพิ่มคอลัมน์อย่างเดียว มีค่าเริ่มต้นทุกคอลัมน์ · ไม่มี CREATE EXTENSION (deployment.md ข้อ 4.1)

-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "book_pity" JSON NOT NULL DEFAULT '{}',
ADD COLUMN     "skill_books" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skill_mastery" JSON NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "duel_snapshots" ADD COLUMN     "skill_ranks" JSON NOT NULL DEFAULT '{}';
