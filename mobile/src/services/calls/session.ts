import type { CallMode, CallDescriptionInput, CallIceInput, ConsultationCall } from '@shared/types/consultationCallContracts';
import type { RemoteIce, Signaling } from './signaling';

type Description = CallDescriptionInput<'offer' | 'answer'>;
export interface Peer {
  offer(): Promise<Description>;
  answer(): Promise<Description>;
  local(description: Description): Promise<void>;
  remote(description: Description): Promise<void>;
  candidate(candidate: CallIceInput): Promise<void>;
  close(): void;
}
export interface PeerEvents {
  ice(candidate: CallIceInput | null): void;
  connection(state: string): void;
}
export type CallSessionState = {
  phase: 'idle' | 'loading' | 'starting' | 'ringing' | 'accepting' | 'connecting' | 'connected' | 'ending' | 'ended' | 'error' | 'disposed';
  call: ConsultationCall | null;
  error: string | null;
};
export interface CallSessionOptions {
  consultationId: string;
  uid: string;
  signaling: Signaling;
  requestId(): string;
  createPeer(mode: CallMode, events: PeerEvents): Peer;
  now?: () => number;
}
const milliseconds = (t: { seconds: number; nanoseconds: number }) => t.seconds * 1000 + t.nanoseconds / 1e6;
const errorCode = (e: unknown) => typeof (e as {code?: unknown})?.code === 'string'
  ? String((e as {code: string}).code).replace(/^functions\//, '') : 'signaling-failed';

/** One controller owns one attempt. Dispose on unmount, backgrounding or any identity change. */
export function createCallSession(options: CallSessionOptions) {
  const { signaling: api, consultationId, uid } = options;
  const now = options.now ?? Date.now;
  let state: CallSessionState = { phase: 'idle', call: null, error: null };
  const observers = new Set<(state: CallSessionState) => void>();
  const stops: (() => void)[] = [];
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  let active = true, peer: Peer | null = null, accepted = false, remoteReady = false;
  let pending: CallIceInput[] = [], totalIce = 0, sending = false, iceListening = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let setup: ReturnType<typeof setTimeout> | undefined;
  let serial = Promise.resolve();
  const seenRemote = new Set<string>(), seenLocal = new Set<string>();
  const emit = (patch: Partial<CallSessionState>) => {
    state = { ...state, ...patch }; observers.forEach(fn => fn({ ...state }));
  };
  const cleanup = () => {
    active = false;
    stops.splice(0).forEach(stop => stop());
    timers.forEach((cancel, timer) => { clearTimeout(timer); cancel(); }); timers.clear();
    if (deadline) clearTimeout(deadline);
    if (setup) clearTimeout(setup);
    peer?.close(); peer = null; pending = []; seenRemote.clear(); seenLocal.clear();
  };
  const fail = (e: unknown) => {
    if (!active) return;
    cleanup(); emit({ phase: 'error', error: errorCode(e), call: null });
  };
  const sleep = (ms: number) => new Promise<boolean>(resolve => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(active || state.phase === 'ending'); }, ms);
    timers.set(timer, () => resolve(false));
  });
  async function retry<T>(operation: () => Promise<T>, ice = false, ending = false): Promise<T> {
    const current = () => active || (ending && state.phase === 'ending');
    for (let attempt = 0; ; attempt++) {
      if (!current()) throw new Error('Call session ended.');
      try { const result = await operation(); if (!current()) throw new Error('Call session ended.'); return result; }
      catch (e) {
        if (!current() || attempt >= 2 || !['unavailable','deadline-exceeded', ...(ice ? ['resource-exhausted'] : [])].includes(errorCode(e))) throw e;
        if (!await sleep(1100 * (attempt + 1))) throw e;
      }
    }
  }
  // Serializes asynchronous description/ICE application; duplicate snapshots cannot race each other.
  const enqueue = (action: () => Promise<void>) => {
    serial = serial.then(async () => { if (active) await action(); }).catch(fail);
  };
  function track(stop: () => void) { if (active) stops.push(stop); else stop(); }
  function bound(call: ConsultationCall) {
    if (call.consultationId !== consultationId || call.appointmentId !== consultationId
      || ![call.initiatorId, call.recipientId].includes(uid)
      || (state.call && (call.callId !== state.call.callId))) throw new Error('Invalid call binding.');
    if (state.call && (['patientId','doctorId','initiatorId','recipientId','mode'] as const)
      .some(key => call[key] !== state.call![key])) throw new Error('Changed call binding.');
  }
  function metadata(call: ConsultationCall) {
    if (!active) return;
    bound(call);
    // Ignore stale ringing snapshots after acceptance; terminal states stop the controller permanently.
    if (accepted && call.state === 'ringing') return;
    if (call.state === 'ended') { cleanup(); emit({ phase: 'ended', call, error: null }); return; }
    accepted = call.state === 'accepted';
    const remaining = milliseconds(accepted ? call.expiresAt : call.ringExpiresAt) - now();
    if (remaining <= 0) {
      cleanup(); emit({ phase: 'ended', call: null, error: 'expired' });
      // Server reconciliation is best effort; local expiry never grants new authority.
      void api.get({ consultationId, callId: call.callId }).catch(() => {});
      return;
    }
    if (deadline) clearTimeout(deadline);
    deadline = setTimeout(() => { if (active) metadata(call); }, Math.min(Math.ceil(remaining), 2147483647));
    emit({ call, phase: accepted ? (state.phase === 'connected' ? 'connected' : 'connecting')
      : state.phase === 'accepting' ? 'accepting' : 'ringing' });
    if (!accepted || !peer) return;
    enqueue(async () => {
      if (!remoteReady && uid === call.initiatorId) {
        const answer = await retry(() => api.description(call, 'answer'));
        if (!active) return;
        await peer!.remote(answer); if (!active) return; remoteReady = true;
      }
      if (!iceListening && remoteReady) {
        iceListening = true;
        const other = uid === call.initiatorId ? call.recipientId : call.initiatorId;
        track(api.ice(call, other, items => enqueue(() => receive(items)), fail));
      }
      void flush();
    });
  }
  async function receive(items: RemoteIce[]) {
    for (const item of items) {
      if (!active || !remoteReady) return;
      if (seenRemote.has(item.id)) continue;
      const { id, sequence, ...candidate } = item;
      await peer!.candidate(candidate); if (!active) return; seenRemote.add(id);
    }
  }
  async function flush() {
    if (!active || !accepted || sending || !state.call || !pending.length) return;
    sending = true;
    try {
      while (active && accepted && pending.length && state.call) {
        const input = { consultationId, callId: state.call.callId, requestId: options.requestId(), candidates: pending.splice(0, 32) };
        // The same immutable input and UUID survive uncertain transport responses.
        const result = await retry(() => api.publish(input), true);
        if (!active) return; metadata(result.call);
        if (!active || !await sleep(1100)) return;
      }
    } catch (e) { fail(e); } finally { sending = false; }
  }
  function makePeer(mode: CallMode) {
    peer = options.createPeer(mode, {
      ice(candidate) {
        if (!active || !candidate?.candidate) return;
        const key = JSON.stringify(candidate);
        if (seenLocal.has(key)) return;
        if (++totalIce > 128) { fail({code:'resource-exhausted'}); return; }
        seenLocal.add(key); pending.push({ ...candidate }); void flush();
      },
      connection(value) {
        if (!active) return;
        if (value === 'failed' || value === 'disconnected' || value === 'closed') fail({code:'connection-lost'});
        else if (value === 'connected' && accepted) emit({phase:'connected'});
      },
    });
  }
  function follow(call: ConsultationCall) {
    if (setup) clearTimeout(setup);
    metadata(call);
    if (!active) return;
    track(api.watch(call, next => { try { metadata(next); } catch (e) { fail(e); } }, fail));
    // Reconcile terminal appointments, which do not automatically update the call document.
    const heartbeat = async () => {
      if (!await sleep(15000)) return;
      try {
        const result = await retry(() => api.get({consultationId, callId:call.callId}));
        if (!active) return;
        if (!result.call) throw new Error('Call missing.');
        metadata(result.call); if (active) void heartbeat();
      } catch(e) { fail(e); }
    };
    void heartbeat();
  }
  async function action(work: () => Promise<void>) {
    try { await work(); } catch(e) { fail(e); }
  }
  return {
    subscribe(next: (state: CallSessionState) => void) { observers.add(next); next({...state}); return () => { observers.delete(next); }; },
    start(mode: CallMode) {
      if (state.phase !== 'idle' || !active) return Promise.resolve();
      emit({phase:'starting'});
      setup = setTimeout(() => fail({code:'deadline-exceeded'}), 30000);
      return action(async () => {
        makePeer(mode);
        const description = await peer!.offer(); if (!active) return;
        const offer = {type:'offer' as const, sdp:description.sdp};
        await peer!.local(offer); if (!active) return;
        const input = {consultationId, requestId:options.requestId(), mode, offer};
        const result = await retry(() => api.start(input)); if (active) follow(result.call);
      });
    },
    load(callId?: string) {
      if (state.phase !== 'idle' || !active) return Promise.resolve();
      emit({phase:'loading'});
      setup = setTimeout(() => fail({code:'deadline-exceeded'}), 30000);
      return action(async () => {
        const result = await retry(() => api.get({consultationId, ...(callId ? {callId} : {})}));
        if (!active) return;
        if (!result.call) { cleanup(); emit({phase:'ended',call:null}); return; }
        bound(result.call);
        if (result.call.state === 'accepted') throw {code:'session-resume-unsupported'};
        follow(result.call);
      });
    },
    accept() {
      const call = state.call;
      if (!active || state.phase !== 'ringing' || !call || call.recipientId !== uid) return Promise.resolve();
      emit({phase:'accepting'});
      return action(async () => {
        const offer = await retry(() => api.description(call, 'offer')); if (!active) return;
        makePeer(call.mode); await peer!.remote(offer); if (!active) return; remoteReady = true;
        const description = await peer!.answer(); if (!active) return;
        const answer = {type:'answer' as const, sdp:description.sdp};
        await peer!.local(answer); if (!active) return;
        const input = {consultationId, callId:call.callId, requestId:options.requestId(), action:'accept' as const, answer};
        const result = await retry(() => api.respond(input)); if (active) metadata(result.call);
      });
    },
    end() {
      const call = state.call;
      if (!active || !call || state.phase === 'ending') return Promise.resolve();
      cleanup(); emit({phase:'ending'});
      return (async () => {
        try {
        const input = {consultationId, callId:call.callId, requestId:options.requestId()};
        const result = await retry(() => call.state === 'ringing' && call.recipientId === uid
          ? api.respond({...input, action:'reject'}) : api.end(input), false, true);
        if (state.phase === 'ending') emit({phase:'ended',call:result.call});
        } catch(e) { if (state.phase === 'ending') emit({phase:'error',call:null,error:errorCode(e)}); }
      })();
    },
    dispose() { cleanup(); emit({phase:'disposed',call:null,error:null}); observers.clear(); },
  };
}
