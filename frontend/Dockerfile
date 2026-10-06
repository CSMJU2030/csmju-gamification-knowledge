# หน้าเว็บของ Code Tower (Next.js standalone) — standards/docs/deployment.md ข้อ 3
# ต้นแบบ: standards/templates/csmju-subsystem-web/Dockerfile · ต่างกันแค่ต้อง copy packages/engine
# (หน้าเว็บ import ต้นฉบับของ engine ผ่าน tsconfig paths แล้ว Next bundle รวมเข้าไป)
#
# build จากรากของ repo เพราะ pnpm workspace เก็บ lockfile ไว้ที่ราก:
#   docker build -f frontend/Dockerfile -t csmju-gamification-knowledge-web .
#
# - BACKEND_URL ถูกฝังลง image ตอน build (rewrites ของ next.config.ts ถูกคำนวณตอน next build)
#   ตั้งตอนรัน container แล้วไม่มีผล · http://api:4000 คือ service "api" ใน compose ของระบบเดียวกัน — ห้ามเปลี่ยน
# - ห้ามใส่ secret ใน ARG / ENV — ใครดึง image ไปก็อ่านได้

# ---------- build stage ----------
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY frontend/package.json frontend/
COPY packages/engine/package.json packages/engine/
RUN pnpm install --frozen-lockfile --filter frontend...

COPY packages/engine/ packages/engine/
COPY frontend/ frontend/
RUN mkdir -p frontend/public
ARG BACKEND_URL=http://api:4000
ENV BACKEND_URL=$BACKEND_URL
RUN pnpm --filter frontend build

# ---------- runtime stage ----------
FROM node:22-alpine AS runner

WORKDIR /app
ARG BACKEND_URL=http://api:4000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    BACKEND_URL=$BACKEND_URL

# standalone ของ pnpm workspace คงโครงของ workspace ไว้:
# /app/frontend/server.js และ node_modules ที่ trace แล้วอยู่ที่ /app/node_modules
COPY --from=builder --chown=node:node /app/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=node:node /app/frontend/public ./frontend/public

USER node
EXPOSE 3000

# ตรวจแค่ว่า server รับการเชื่อมต่อ — ไม่ขึ้นกับ backend
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('net').connect(3000,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "frontend/server.js"]
