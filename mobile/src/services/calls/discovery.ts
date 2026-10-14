import type { ConsultationCall } from '@shared/types/consultationCallContracts';
import { callSignaling, type Signaling } from './signaling';

/** Foreground, known-consultation discovery only. Never lists calls or reads private pointers. */
export function discoverConsultationCalls(consultationId: string,
  next: (call: ConsultationCall | null) => void, error: () => void,
  api: Pick<Signaling, 'get'> = callSignaling) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function poll() {
    try {
      const result = await api.get({consultationId});
      if (stopped) return;
      next(result.call);
      if (!stopped) timer = setTimeout(() => { void poll(); }, 5000);
    } catch {
      if (!stopped) { stopped = true; error(); }
    }
  }
  void poll();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
