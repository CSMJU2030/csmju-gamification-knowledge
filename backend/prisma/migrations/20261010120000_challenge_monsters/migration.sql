-- มอนของโจทย์ที่ผู้สอนออกแบบ และผลการสู้ของผู้เล่น (docs/design-challenge-monsters.md)
-- เพิ่มตารางอย่างเดียว · ไม่มี CREATE EXTENSION (deployment.md ข้อ 4.1)

-- CreateTable
CREATE TABLE "challenge_monsters" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "archetype_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "hp_mult" DOUBLE PRECISION NOT NULL,
    "dmg_mult" DOUBLE PRECISION NOT NULL,
    "skills" TEXT[],
    "program_source" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "challenge_monsters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_attempts" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "is_victory" BOOLEAN NOT NULL,
    "rounds" INTEGER NOT NULL,
    "exp_gained" INTEGER NOT NULL,
    "gold_gained" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "challenge_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenge_monsters_challenge_id_position_key" ON "challenge_monsters"("challenge_id", "position");

-- CreateIndex
CREATE INDEX "challenge_attempts_challenge_id_character_id_idx" ON "challenge_attempts"("challenge_id", "character_id");

-- AddForeignKey
ALTER TABLE "challenge_monsters" ADD CONSTRAINT "challenge_monsters_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
