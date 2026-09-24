-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "stat_str" INTEGER NOT NULL,
    "stat_int" INTEGER NOT NULL,
    "stat_vit" INTEGER NOT NULL,
    "stat_agi" INTEGER NOT NULL,
    "stat_luk" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 100,
    "materials" INTEGER NOT NULL DEFAULT 0,
    "highest_floor" INTEGER NOT NULL DEFAULT 0,
    "program_source" TEXT NOT NULL,
    "prof_str" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prof_int" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prof_vit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prof_agi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prof_luk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "base_id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "upgrade_level" INTEGER NOT NULL DEFAULT 0,
    "dropped_floor" INTEGER NOT NULL DEFAULT 1,
    "affixes" JSON NOT NULL DEFAULT '[]',
    "is_equipped" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_progress" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "region_id" TEXT NOT NULL,
    "depth_cleared" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "region_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_runs" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "region_id" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "entered_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "duel_character_id" UUID,
    "duel_snapshot_id" UUID,
    "fought_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "region_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_snapshots" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "stats" JSON NOT NULL,
    "derived" JSON NOT NULL,
    "skills" JSON NOT NULL,
    "program_source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "duel_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_matches" (
    "id" UUID NOT NULL,
    "match_key" TEXT NOT NULL,
    "a_character_id" UUID NOT NULL,
    "b_character_id" UUID NOT NULL,
    "winner_character_id" UUID,
    "events" JSON NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "duel_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battles" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "region_id" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "floor" INTEGER NOT NULL,
    "is_victory" BOOLEAN NOT NULL,
    "waves_cleared" INTEGER NOT NULL,
    "exp_gained" INTEGER NOT NULL,
    "gold_gained" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "battles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "starter_source" TEXT NOT NULL,
    "region_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_seq_key" ON "characters"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "characters_core_user_id_key" ON "characters"("core_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "characters_display_name_key" ON "characters"("display_name");

-- CreateIndex
CREATE UNIQUE INDEX "items_seq_key" ON "items"("seq");

-- CreateIndex
CREATE INDEX "items_character_id_idx" ON "items"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "region_progress_character_id_region_id_key" ON "region_progress"("character_id", "region_id");

-- CreateIndex
CREATE UNIQUE INDEX "region_runs_character_id_key" ON "region_runs"("character_id");

-- CreateIndex
CREATE INDEX "region_runs_region_id_expires_at_idx" ON "region_runs"("region_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "duel_snapshots_seq_key" ON "duel_snapshots"("seq");

-- CreateIndex
CREATE INDEX "duel_snapshots_level_created_at_idx" ON "duel_snapshots"("level", "created_at");

-- CreateIndex
CREATE INDEX "duel_snapshots_character_id_created_at_idx" ON "duel_snapshots"("character_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "duel_matches_match_key_key" ON "duel_matches"("match_key");

-- CreateIndex
CREATE INDEX "duel_matches_created_at_idx" ON "duel_matches"("created_at");

-- CreateIndex
CREATE INDEX "battles_character_id_created_at_idx" ON "battles"("character_id", "created_at");

-- CreateIndex
CREATE INDEX "challenges_created_at_idx" ON "challenges"("created_at");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_progress" ADD CONSTRAINT "region_progress_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_runs" ADD CONSTRAINT "region_runs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battles" ADD CONSTRAINT "battles_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
