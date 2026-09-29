import type { NextConfig } from 'next';

/**
 * เบราว์เซอร์คุยกับ origin เดียว (frontend) แล้ว Next ส่งต่อไป backend
 * คุกกี้ session `csmju_gamification_knowledge_access_token` ที่ backend ตั้งตอน SSO callback จึงไปกับทุกคำขอ /api
 * โดยไม่ต้องเปิด CORS · origin นี้คือ origin ของระบบ (base_url ใน subsystem.yaml และ callback_url ในทะเบียน)
 */
const backend = process.env.BACKEND_URL ?? 'http://localhost:3002';

const config: NextConfig = {
  reactStrictMode: true,
  // รัน dev หลายตัวพร้อมกันได้ (เช่นตอนตรวจหลายหน้าคู่ขนาน) โดยไม่แย่งโฟลเดอร์ build กัน
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // lint เป็นขั้นแยกของ CI (`pnpm lint`) ไม่ต้องรันซ้ำตอน build
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // engine อยู่ใน packages/engine (นอกโฟลเดอร์ frontend) — import ต้นฉบับ TypeScript ตรง ๆ ผ่าน tsconfig paths
  experimental: { externalDir: true },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      // Central SSO 1.1 (auth-contract ข้อ 5): login · callback · logout อยู่ที่ backend นอก prefix /api
      { source: '/auth/login', destination: `${backend}/auth/login` },
      { source: '/auth/callback', destination: `${backend}/auth/callback` },
      { source: '/auth/logout', destination: `${backend}/auth/logout` },
    ];
  },
};

export default config;
