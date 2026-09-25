// TODO: depends on the WebRTC signaling design (open decision, Section 8).
// Placeholder hook so screens can be wired up ahead of that decision.
export function useConsultationSession(consultationId: string | null) {
  return {
    connected: false,
    localStream: null,
    remoteStream: null,
    // start, end, toggleMute, etc. to be implemented once signaling is decided
  };
}
