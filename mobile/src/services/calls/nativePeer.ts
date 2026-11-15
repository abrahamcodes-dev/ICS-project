import type { MediaStream, RTCPeerConnection as PeerConnection } from 'react-native-webrtc';
import type { CallMode } from '@shared/types/consultationCallContracts';
import type { Peer, PeerEvents } from './session';
import { releaseCallMedia } from './media';

export interface NativePeerOptions {
  /** Ownership transfers to this session. Permissions/media acquisition happen before supplying it. */
  localStream?: MediaStream;
  configuration?: ConstructorParameters<typeof PeerConnection>[0];
  onRemoteStream?: (stream: MediaStream | null) => void;
  onRemoteAudioUnavailable?: () => void;
}
export function createNativePeer(mode: CallMode, events: PeerEvents, options: NativePeerOptions = {}): Peer {
  // Load only when a session starts; importing the service must not open native media.
  const { RTCPeerConnection } = require('react-native-webrtc') as typeof import('react-native-webrtc');
  // Stable hook options may expose a getter populated only after the user accepts permissions.
  const localStream = options.localStream;
  let pc: PeerConnection;
  try { pc = new RTCPeerConnection(options.configuration ?? {iceServers:[]}); }
  catch(e) {
    releaseCallMedia(localStream);
    options.onRemoteStream?.(null); throw e;
  }
  let closed = false;
  let audioCheck: ReturnType<typeof setTimeout> | undefined;
  let audioChecked = false;
  const remoteStreams = new Set<MediaStream>();
  const streamlessTracks = new Map<string, import('react-native-webrtc').MediaStreamTrack>();
  const ice = (event: any) => {
    if (closed || !event.candidate?.candidate) return;
    const c = event.candidate;
    events.ice({candidate:c.candidate, sdpMid:c.sdpMid ?? null, sdpMLineIndex:c.sdpMLineIndex ?? null,
      ...(typeof c.usernameFragment === 'string' && c.usernameFragment ? {usernameFragment:c.usernameFragment} : {})});
  };
  const connection = () => {
    if (closed) return;
    events.connection(pc.connectionState);
    if (__DEV__ && !audioChecked && pc.connectionState === 'connected') {
      audioChecked = true;
      // One development-only, content-free sample distinguishes RTP transport
      // from device playback. Never log SDP, identifiers, addresses or tracks.
      audioCheck = setTimeout(() => {
        void pc.getStats().then(reports => {
          if (closed) return;
          let sent = 0, received = 0;
          reports.forEach((report: {type?: string; kind?: string; mediaType?: string; packetsSent?: number; packetsReceived?: number}) => {
            if ((report.kind ?? report.mediaType) !== 'audio') return;
            if (report.type === 'outbound-rtp') sent += report.packetsSent ?? 0;
            if (report.type === 'inbound-rtp') received += report.packetsReceived ?? 0;
          });
          const tracks = pc.getReceivers().map(receiver => receiver.track).filter(t => t?.kind === 'audio');
          console.info('[call audio]', {packetsSent: sent, packetsReceived: received,
            liveRemoteAudioTracks: tracks.filter(t => t?.readyState === 'live' && t.enabled).length});
        }).catch(() => { /* Diagnostic sampling must not interrupt a call. */ });
      }, 5000);
    }
  };
  const track = (event: any) => {
    if (closed) return;
    // A connected video transport does not establish that audio was received.
    // Do not force-enable the remote party's muted/ended track.
    if (event.track?.kind === 'audio' && (event.track.readyState === 'ended' || event.track.enabled === false)) {
      options.onRemoteAudioUnavailable?.();
    }
    let streams: MediaStream[] = event.streams ?? [];
    if (!streams.length && event.track) {
      const { MediaStream } = require('react-native-webrtc') as typeof import('react-native-webrtc');
      streamlessTracks.set(event.track.id, event.track);
      streams = [new MediaStream([...streamlessTracks.values()])];
    }
    for (const stream of streams) { remoteStreams.add(stream); options.onRemoteStream?.(stream); }
  };
  pc.onicecandidate = ice;
  pc.onconnectionstatechange = connection;
  pc.ontrack = track;
  const close = () => {
    if (closed) return;
    closed = true;
    if (audioCheck) clearTimeout(audioCheck);
    pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.ontrack = null;
    try { pc.close(); } finally {
      releaseCallMedia(localStream);
      remoteStreams.forEach(s => s.release()); remoteStreams.clear(); streamlessTracks.clear(); options.onRemoteStream?.(null);
    }
  };
  try {
    if (localStream) {
      for (const t of localStream.getTracks()) {
        if (t.kind === 'video' && mode === 'audio') { t.stop(); continue; }
        pc.addTrack(t, localStream);
      }
    } else {
      pc.addTransceiver('audio', {direction:'recvonly'});
      if (mode === 'video') pc.addTransceiver('video', {direction:'recvonly'});
    }
  } catch(e) { close(); throw e; }
  return { offer: () => pc.createOffer(), answer: () => pc.createAnswer(), local: d => pc.setLocalDescription(d),
    remote: d => pc.setRemoteDescription(d), candidate: c => pc.addIceCandidate(c), close };
}
