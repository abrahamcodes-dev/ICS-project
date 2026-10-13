import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { documents, id, path, start, end, deadline, identity } from './consultationFixtures';
import { createCallStore, callPaths } from '../src/consultations/calls/callStore';
import { createStartConsultationCallHandler } from '../src/consultations/calls/startHandler';
import { createCallLifecycleHandlers } from '../src/consultations/calls/lifecycleHandler';
export { id, path, start, end, deadline, identity, callPaths };
export const requestId = '12345678-1234-4234-8234-123456789abc';
export const secondRequestId = '22345678-1234-4234-8234-123456789abc';
export const input = (patch = {}) => ({ consultationId: id, requestId, mode: 'audio', offer: { type: 'offer', sdp: 'v=0\r\ns=synthetic\r\n' }, ...patch });
export const request = (uid = 'patient', data: unknown = input()) => ({ auth: { uid }, data });
export function persisted(value: any): any {
  if (value instanceof Timestamp) return new Timestamp(value.seconds, value.nanoseconds);
  if (Array.isArray(value)) return value.map(persisted);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 2 && 'seconds' in value && 'nanoseconds' in value) return new Timestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, persisted(item)]));
  }
  return value;
}
const clone = (value: any): any => value instanceof Timestamp ? new Timestamp(value.seconds, value.nanoseconds)
  : Array.isArray(value) ? value.map(clone) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
export function seed() {
  return persisted({ ...documents(), [path]: { consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    appointmentStartAt: Timestamp.fromMillis(start), appointmentEndAt: Timestamp.fromMillis(end), state: 'active',
    createdAt: Timestamp.fromMillis(start), closedAt: null, schemaVersion: 1 } });
}
/** Local optimistic SDK double, exercising the real store adapter. Versions/absence reads are
 * rechecked at commit; conflicting attempts rerun the complete callback. This is not emulator proof. */
export function memory() {
  const data: Record<string, any> = seed(), versions = new Map<string, number>();
  let revision = 0, attemptSerial = 0;
  const fixture = {
    data, time: Timestamp.fromMillis(start), attempts: 0, failAfterWrite: 0, forceRetries: 0,
    events: [] as string[], commits: [] as string[][],
    onRead: null as null | ((path: string, attempt: number) => void | Promise<void>),
    beforeCommit: null as null | (() => void),
    put(p: string, value: any) { data[p] = clone(value); versions.set(p, (versions.get(p) ?? 0) + 1); revision++; },
    remove(p: string) { delete data[p]; versions.set(p, (versions.get(p) ?? 0) + 1); revision++; },
  };
  type Ref = { path: string; query?: boolean; limit?: number };
  const doc = (p: string): Ref => ({ path: p });
  const collection = (p: string) => ({ doc: (key: string) => doc(p + '/' + key), limit: (n: number): Ref => ({ path: p, query: true, limit: n }) });
  const db = { doc, collection, async runTransaction<T>(action: (tx: any) => Promise<T>): Promise<T> {
    for (let retry = 0; retry < 10; retry++) {
      const attempt = ++attemptSerial; fixture.attempts++;
      const reads = new Map<string, number>(), writes: { kind: string; path: string; value: any }[] = [];
      let queryRevision: number | null = null;
      const stage = (kind: string, ref: Ref, value: any) => {
        fixture.events.push(`${attempt}:write:${ref.path}`); writes.push({ kind, path: ref.path, value: clone(value) });
        if (fixture.failAfterWrite === writes.length) throw new Error('synthetic-write-failure');
      };
      const tx = {
        async get(ref: Ref) {
          if (writes.length) throw new Error('read-after-write');
          fixture.events.push(`${attempt}:read:${ref.path}`);
          let result;
          if (ref.query) {
            queryRevision = revision;
            const docs = Object.keys(data).filter(p => p.startsWith(ref.path + '/') && p.split('/').length === ref.path.split('/').length + 1)
              .sort().slice(0, ref.limit).map(p => { const copy = clone(data[p]); return { id: p.split('/').pop(), data: () => copy }; });
            result = { empty: docs.length === 0, size: docs.length, docs };
          } else {
            reads.set(ref.path, versions.get(ref.path) ?? 0);
            const copy = clone(data[ref.path]); result = { data: () => copy };
          }
          await fixture.onRead?.(ref.path, attempt);
          return result;
        },
        create: (ref: Ref, value: any) => stage('create', ref, value),
        set: (ref: Ref, value: any) => stage('set', ref, value),
        update: (ref: Ref, value: any) => stage('update', ref, value),
      };
      const result = await action(tx);
      fixture.beforeCommit?.();
      if (fixture.forceRetries > 0) { fixture.forceRetries--; continue; }
      if ((queryRevision !== null && revision !== queryRevision) || [...reads].some(([p, v]) => (versions.get(p) ?? 0) !== v)) continue;
      for (const w of writes) {
        if (w.kind === 'create' && data[w.path] !== undefined) throw new Error('create-precondition');
        if (w.kind === 'update' && data[w.path] === undefined) throw new Error('update-precondition');
      }
      for (const w of writes) fixture.put(w.path, w.kind === 'update' ? { ...data[w.path], ...w.value } : w.value);
      fixture.commits.push(writes.map(w => w.path));
      return result;
    }
    throw new Error('transaction-retry-exhausted');
  } };
  const deps = createCallStore(db as unknown as Firestore);
  deps.now = () => { fixture.events.push('clock'); return { seconds: fixture.time.seconds, nanoseconds: fixture.time.nanoseconds }; };
  return { ...fixture, deps, handler: createStartConsultationCallHandler(deps), lifecycle: createCallLifecycleHandlers(deps),
    // Accessor-backed controls must update the object captured by transaction callbacks.
    get time() { return fixture.time; }, set time(v: Timestamp) { fixture.time = v; },
    get attempts() { return fixture.attempts; }, get failAfterWrite() { return fixture.failAfterWrite; }, set failAfterWrite(v: number) { fixture.failAfterWrite = v; },
    get forceRetries() { return fixture.forceRetries; }, set forceRetries(v: number) { fixture.forceRetries = v; },
    get onRead() { return fixture.onRead; }, set onRead(v) { fixture.onRead = v; },
    get beforeCommit() { return fixture.beforeCommit; }, set beforeCommit(v) { fixture.beforeCommit = v; },
  };
}
