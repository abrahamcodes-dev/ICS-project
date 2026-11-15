import type { MediaStream } from 'react-native-webrtc';
import type { CallMode } from '@shared/types/consultationCallContracts';
import { startCallAudio } from './audio';

const released = new WeakSet<MediaStream>();
const audioCleanup = new WeakMap<MediaStream, () => void>();
/** The UI and peer may both tear down. Native tracks must be released only once. */
export function releaseCallMedia(stream?: MediaStream | null) {
  if (!stream || released.has(stream)) return;
  released.add(stream);
  try { stream.getTracks().forEach(track => track.stop()); }
  finally { try { stream.release(); } finally { audioCleanup.get(stream)?.(); audioCleanup.delete(stream); } }
}
export class CallMediaError extends Error {
  constructor(readonly reason: 'permission' | 'unavailable') {
    super(reason === 'permission' ? 'Allow microphone access, and camera access for video calls, in your device settings.'
      : 'Unable to start the microphone or camera. Check device availability and permissions.');
  }
}

/** Cancellation also covers permission dialogs and a late getUserMedia result. */
export function createCallMedia(onInterrupted: () => void = () => {}) {
  let generation = 0, current: MediaStream | null = null;
  let audio: ReturnType<typeof startCallAudio> | undefined;
  const clear = () => {
    generation++;
    const stream = current, session = audio; current = null; audio = undefined;
    try { releaseCallMedia(stream); } finally { session?.stop(); }
  };
  return {
    get stream() { return current; },
    clear,
    async acquire(mode: CallMode): Promise<MediaStream | null> {
      clear(); const version = generation;
      let session: ReturnType<typeof startCallAudio> | undefined;
      try {
        const { permissions, mediaDevices } = require('react-native-webrtc') as typeof import('react-native-webrtc');
        for (const name of mode === 'video' ? ['microphone','camera'] : ['microphone']) {
          const granted = await permissions.request({name});
          if (version !== generation) return null;
          if (!granted) throw new CallMediaError('permission');
        }
        session = startCallAudio(mode, () => {
          if (version === generation) { clear(); onInterrupted(); }
        });
        audio = session;
        const stream = await mediaDevices.getUserMedia({audio:true, video:mode === 'video' ? {facingMode:'user'} : false});
        audioCleanup.set(stream, session.stop);
        if (version !== generation) { releaseCallMedia(stream); return null; }
        // The native SDK can silently drop denied tracks; never negotiate a partial video call.
        if (!stream.getAudioTracks().length || (mode === 'video' && !stream.getVideoTracks().length)) {
          releaseCallMedia(stream); throw new CallMediaError('permission');
        }
        if (stream.getAudioTracks().some(track => track.readyState === 'ended' || !track.enabled)) {
          releaseCallMedia(stream); throw new CallMediaError('unavailable');
        }
        current = stream; return stream;
      } catch(e) {
        session?.stop();
        if (version !== generation) return null;
        throw e instanceof CallMediaError ? e : new CallMediaError('unavailable');
      }
    },
    speaker(enabled: boolean | null) { audio?.speaker(enabled); },
    microphone(enabled: boolean) { current?.getAudioTracks().forEach(t => { t.enabled = enabled; }); },
    camera(enabled: boolean) { current?.getVideoTracks().forEach(t => { t.enabled = enabled; }); },
    switchCamera() {
      const track = current?.getVideoTracks()[0];
      if (!track || typeof track._switchCamera !== 'function') return false;
      try { track._switchCamera(); return true; } catch { return false; }
    },
  };
}
