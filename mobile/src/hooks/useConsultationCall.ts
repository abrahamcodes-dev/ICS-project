import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { onIdentityRefresh } from '../services/authService';
import { callSignaling } from '../services/calls/signaling';
import { createCallSession, type CallSessionState } from '../services/calls/session';
import { createNativePeer, type NativePeerOptions } from '../services/calls/nativePeer';
import { useAuth } from './useAuth';
import { releaseCallMedia } from '../services/calls/media';

/** Memoize options. A new object intentionally disposes the previous session.
 * No automatic call/start, polling for incoming calls, or media capture on mount.
 */
export function useConsultationCall(consultationId: string | null,
  options: NativePeerOptions & { requestId(): string }) {
  const identity = useAuth();
  const [session, setSession] = useState<ReturnType<typeof createCallSession> | null>(null);
  const [state, setState] = useState<CallSessionState>({phase:'idle',call:null,error:null});
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !consultationId || identity.status !== 'ready' || identity.user?.status !== 'active'
      || !['patient','doctor'].includes(identity.user?.role ?? '')) {
      setSession(null); setState({phase:'idle',call:null,error:null}); return;
    }
    let peerCreated = false, disposed = false, unusedReleased = false;
    const current = createCallSession({consultationId, uid, signaling:callSignaling, requestId:options.requestId,
      createPeer:(mode, events) => { peerCreated = true; return createNativePeer(mode, events, options); }});
    const releaseUnused = () => {
      // An incoming call may be dismissed before a peer ever takes ownership of supplied media.
      if (!peerCreated && !unusedReleased) {
        unusedReleased = true;
        releaseCallMedia(options.localStream);
        options.onRemoteStream?.(null);
      }
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true; current.dispose(); releaseUnused();
    };
    const stop = current.subscribe(value => {
      setState(value);
      if (['ended','error','disposed'].includes(value.phase)) releaseUnused();
    });
    const authStop = onAuthStateChanged(auth, user => { if (user?.uid !== uid) dispose(); });
    const identityStop = onIdentityRefresh(dispose);
    // iOS permission prompts temporarily make the app inactive; background is the privacy boundary.
    const appStop = AppState.addEventListener('change', value => { if (value === 'background') dispose(); });
    setSession(current);
    return () => { stop(); dispose(); authStop(); identityStop(); appStop.remove(); };
  }, [consultationId, options, identity.firebaseUid, identity.status, identity.user?.role, identity.user?.status]);
  return {session, state};
}
