import type { MediaStream, RTCPeerConnection as PeerConnection } from 'react-native-webrtc';
import type { CallMode } from '@shared/types/consultationCallContracts';
import type { Peer, PeerEvents } from './session';

export interface NativePeerOptions {
  /** Ownership transfers to this session. Permissions/media acquisition happen before supplying it. */
  localStream?: MediaStream;
  configuration?: ConstructorParameters<typeof PeerConnection>[0];
  onRemoteStream?: (stream: MediaStream | null) => void;
}
export function createNativePeer(mode: CallMode, events: PeerEvents, options: NativePeerOptions = {}): Peer {
  // Load only when a session starts; importing the service must not open native media.
  const { RTCPeerConnection } = require('react-native-webrtc') as typeof import('react-native-webrtc');
  let pc: PeerConnection;
  try { pc = new RTCPeerConnection(options.configuration ?? {iceServers:[]}); }
  catch(e) {
    options.localStream?.getTracks().forEach(t => t.stop()); options.localStream?.release();
    options.onRemoteStream?.(null); throw e;
  }
  let closed = false;
  const remoteStreams = new Set<MediaStream>();
  const ice = (event: any) => {
    if (closed || !event.candidate?.candidate) return;
    const c = event.candidate;
    events.ice({candidate:c.candidate, sdpMid:c.sdpMid ?? null, sdpMLineIndex:c.sdpMLineIndex ?? null,
      ...(typeof c.usernameFragment === 'string' && c.usernameFragment ? {usernameFragment:c.usernameFragment} : {})});
  };
  const connection = () => { if (!closed) events.connection(pc.connectionState); };
  const track = (event: any) => {
    if (closed) return;
    for (const stream of event.streams ?? []) { remoteStreams.add(stream); options.onRemoteStream?.(stream); }
  };
  pc.onicecandidate = ice;
  pc.onconnectionstatechange = connection;
  pc.ontrack = track;
  const close = () => {
    if (closed) return;
    closed = true;
    pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.ontrack = null;
    try { pc.close(); } finally {
      options.localStream?.getTracks().forEach(t => t.stop());
      options.localStream?.release();
      remoteStreams.forEach(s => s.release()); remoteStreams.clear(); options.onRemoteStream?.(null);
    }
  };
  try {
    if (options.localStream) {
      for (const t of options.localStream.getTracks()) {
        if (t.kind === 'video' && mode === 'audio') { t.stop(); continue; }
        pc.addTrack(t, options.localStream);
      }
    } else {
      pc.addTransceiver('audio', {direction:'recvonly'});
      if (mode === 'video') pc.addTransceiver('video', {direction:'recvonly'});
    }
  } catch(e) { close(); throw e; }
  return { offer: () => pc.createOffer(), answer: () => pc.createAnswer(), local: d => pc.setLocalDescription(d),
    remote: d => pc.setRemoteDescription(d), candidate: c => pc.addIceCandidate(c), close };
}
