# api ของ Code Tower (NestJS + Prisma) — standards/docs/deployment.md ข้อ 3
# build จากรากของ repo เพราะ pnpm workspace เก็บ lockfile ไว้ที่ราก และ backend ใช้ packages/engine:
#   docker build -f backend/Dockerfile -t csmju-gamification-knowledge-api .
#
# - ตอนสตาร์ต: prisma migrate deploy แล้ว node dist/main.js (docker/entrypoint.sh)
# - ห้ามใส่ secret ใน ARG / ENV — DATABASE_URL และค่าของ Core Hub มาจาก env ตอนรัน (deployment.md ข้อ 4.2)

# ---------- build stage ----------
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY packages/engine/package.json packages/engine/
RUN pnpm install --frozen-lockfile --filter backend...

COPY packages/engine/ packages/engine/
COPY backend/ backend/
# engine ก่อน — backend import @tower/engine จาก dist ของ engine (package.json "main")
RUN pnpm --filter @tower/engine build && pnpm --filter backend build

# ---------- runtime stage ----------
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# ติดตั้งเฉพาะ dependency ตอนรัน (รวม prisma CLI ที่ใช้ migrate) ·
# ไม่ใส่ --ignore-scripts เพราะ @prisma/engines ต้องดาวน์โหลด schema engine ตอนนี้ ·
# ลบ store และ cache ของ pnpm/corepack ใน RUN เดียวกัน ไม่งั้นติดไปใน image อีกหลายร้อย MB (deployment.md ข้อ 3.4)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY packages/engine/package.json packages/engine/
RUN corepack enable pnpm \
 && pnpm install --frozen-lockfile --prod --filter backend... \
 && rm -rf "$(pnpm store path)" /root/.cache /root/.local/share/pnpm /tmp/*

COPY --from=builder /app/packages/engine/dist packages/engine/dist
COPY --from=builder /app/backend/dist backend/dist
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
COPY backend/docker/entrypoint.sh backend/docker/

# ระบบไฟล์ของ container บน server อ่านอย่างเดียว — ปิด update check ของ Prisma ที่จะเขียน cache
ENV NODE_ENV=production \
    PORT=4000 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app/backend
USER node
EXPOSE 4000

# GET /api/health ตอบ 200 (API-05)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["sh", "docker/entrypoint.sh"]
