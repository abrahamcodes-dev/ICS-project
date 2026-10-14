import type { MediaStream } from 'react-native-webrtc';
import type { CallMode } from '@shared/types/consultationCallContracts';

const released = new WeakSet<MediaStream>();
/** The UI and peer may both tear down. Native tracks must be released only once. */
export function releaseCallMedia(stream?: MediaStream | null) {
  if (!stream || released.has(stream)) return;
  released.add(stream);
  try { stream.getTracks().forEach(track => track.stop()); } finally { stream.release(); }
}
export class CallMediaError extends Error {
  constructor(readonly reason: 'permission' | 'unavailable') {
    super(reason === 'permission' ? 'Allow microphone access, and camera access for video calls, in your device settings.'
      : 'Unable to start the microphone or camera. Check device availability and permissions.');
  }
}

/** Cancellation also covers permission dialogs and a late getUserMedia result. */
export function createCallMedia() {
  let generation = 0, current: MediaStream | null = null;
  const clear = () => { generation++; releaseCallMedia(current); current = null; };
  return {
    get stream() { return current; },
    clear,
    async acquire(mode: CallMode): Promise<MediaStream | null> {
      clear(); const version = generation;
      try {
        const { permissions, mediaDevices } = require('react-native-webrtc') as typeof import('react-native-webrtc');
        for (const name of mode === 'video' ? ['microphone','camera'] : ['microphone']) {
          const granted = await permissions.request({name});
          if (version !== generation) return null;
          if (!granted) throw new CallMediaError('permission');
        }
        const stream = await mediaDevices.getUserMedia({audio:true, video:mode === 'video' ? {facingMode:'user'} : false});
        if (version !== generation) { releaseCallMedia(stream); return null; }
        // The native SDK can silently drop denied tracks; never negotiate a partial video call.
        if (!stream.getAudioTracks().length || (mode === 'video' && !stream.getVideoTracks().length)) {
          releaseCallMedia(stream); throw new CallMediaError('permission');
        }
        current = stream; return stream;
      } catch(e) {
        if (version !== generation) return null;
        throw e instanceof CallMediaError ? e : new CallMediaError('unavailable');
      }
    },
    microphone(enabled: boolean) { current?.getAudioTracks().forEach(t => { t.enabled = enabled; }); },
    camera(enabled: boolean) { current?.getVideoTracks().forEach(t => { t.enabled = enabled; }); },
    switchCamera() {
      const track = current?.getVideoTracks()[0];
      if (!track || typeof track._switchCamera !== 'function') return false;
      try { track._switchCamera(); return true; } catch { return false; }
    },
  };
}
