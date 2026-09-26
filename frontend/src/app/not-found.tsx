import Link from '@/components/AppLink';
import { secondaryButtonClass } from '@/csmju';
import { EmptyState } from '@/components/feedback';

/** 404 = EmptyState ไม่ใช่หน้า error สีแดง (ui-design-system ข้อ 16.2) */
export default function NotFound() {
  return (
    <EmptyState
      title="ไม่พบหน้านี้"
      description="ไม่พบข้อมูลที่คุณกำลังค้นหา อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง"
      action={
        <Link href="/" className={secondaryButtonClass}>
          กลับหน้าตัวละคร
        </Link>
      }
    />
  );
}
