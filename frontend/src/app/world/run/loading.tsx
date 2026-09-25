import RunSkeleton from '@/game-stage/world/RunSkeleton';

/**
 * ต้องมีของตัวเอง — ไม่งั้นระหว่างเปลี่ยนจาก /world มาหน้านี้ Next จะใช้ loading ของ /world
 * (โครงแผนที่) ซึ่งไม่ใช่หน้าตาของหน้านี้เลย
 */
export default function WorldRunLoading() {
  return <RunSkeleton />;
}
