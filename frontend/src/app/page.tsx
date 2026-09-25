'use client';

import Link from 'next/link';
import { PageHeader, StatusBadge, TowerIcon, primaryButtonClass } from '@/csmju';
import { Alert, ErrorState, LoadingRegion, Skeleton } from '@/components/feedback';
import { useGame } from '@/lib/game/session';
import { ROLE_BADGE, ROLE_TH } from '@/lib/game/labels';
import { useCsmjuUser } from '@/csmju';
import { CharacterOverview } from './_character/CharacterOverview';
import { ClassChoice } from './_character/ClassChoice';
import { CreateCharacter } from './_character/CreateCharacter';

function RoleBadge() {
  const user = useCsmjuUser();
  if (user.status !== 'ready') return null;
  const core = ROLE_TH[user.user.coreRole] ?? user.user.coreRole;
  const sub = ROLE_BADGE[user.user.subsystemRole];
  return <StatusBadge tone="info">{sub && user.user.subsystemRole !== 'PLAYER' ? `${core} · ${sub}` : core}</StatusBadge>;
}

function CharacterSkeleton() {
  return (
    <LoadingRegion label="กำลังโหลดตัวละคร">
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </LoadingRegion>
  );
}

export default function CharacterPage() {
  const { character, gameData, setCharacter, reloadCharacter } = useGame();

  return (
    <>
      <PageHeader
        title="ตัวละคร"
        description="ดูว่าตัวละครเก่งขึ้นตรงไหน และโค้ดของเราทำงานแบบไหนในเลเวลนี้"
        aside={<RoleBadge />}
      />

      {character.status === 'loading' && <CharacterSkeleton />}
      {character.status === 'error' && <ErrorState message={character.error.message} onRetry={reloadCharacter} />}
      {character.status === 'none' && <CreateCharacter onCreated={setCharacter} />}
      {character.status === 'ready' && (
        <>
          {character.character.highestFloorCleared === 0 && (
            <Alert
              tone="info"
              action={
                <Link href="/tower" className={primaryButtonClass}>
                  <TowerIcon className="h-4 w-4" />
                  ลองรบชั้น 1
                </Link>
              }
            >
              ตัวละครพร้อมแล้ว โปรแกรมพื้นฐานสั่งให้ตีศัตรูทุกเทิร์น — ลองรบชั้น 1 ของหอคอยดูก่อน แล้วค่อยกลับมาแก้โปรแกรม
            </Alert>
          )}
          {character.character.classId === 'novice' && character.character.highestFloorCleared >= 1 && (
            <ClassChoice character={character.character} onChosen={setCharacter} />
          )}
          <CharacterOverview character={character.character} gameData={gameData} />
          {character.character.classId === 'novice' && character.character.highestFloorCleared === 0 && (
            <ClassChoice character={character.character} onChosen={setCharacter} />
          )}
        </>
      )}
    </>
  );
}
