import { useEffect, useState } from 'react';
import { createSchedulingSession, type SchedulingSession } from '../services/schedulingService';
export function useSchedulingSession(uid: string) {
  const [value, setValue] = useState<{ uid: string; session: SchedulingSession } | null>(null);
  useEffect(() => {
    const session = createSchedulingSession(uid); setValue({ uid, session });
    return () => session.dispose();
  }, [uid]);
  return value?.uid === uid ? value.session : null;
}
