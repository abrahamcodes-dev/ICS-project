/**
 * OPEN DECISION — Supervisor Development Guide, Section 8 & 18.
 *
 * The source proposal specifies WebRTC for voice/video consultation but does
 * not define a signaling channel or STUN/TURN configuration. Both are
 * required for two devices to establish a peer connection, especially across
 * different mobile networks (NAT traversal).
 *
 * Two common options to bring to the supervisor before Sprint 4:
 *   1. Firestore-as-signaling: write SDP offer/answer + ICE candidates to a
 *      Firestore subcollection under the consultation doc, and use Firestore
 *      realtime listeners on both clients. Simplest to build with the
 *      existing stack; adds Firestore read/write cost per candidate.
 *   2. A small dedicated signaling server (e.g. Socket.IO on Cloud Run),
 *      independent of Firestore. More standard for production WebRTC apps,
 *      but adds a second backend service outside Cloud Functions.
 *
 * STUN can use a free public server (e.g. Google's) for development; TURN
 * (needed when direct peer connections fail) has no free reliable public
 * option and would need a provider (e.g. Twilio, Xirsys) or self-hosting
 * (coturn) — not mentioned anywhere in the source document.
 *
 * Nothing below is implemented until this decision is made.
 */

export function createSignalingChannel(_consultationId: string): never {
  throw new Error("Signaling design not yet decided — see comment block above.");
}
