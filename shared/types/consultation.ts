export type ConsultationMode = "chat" | "voice" | "video";
export type ConsultationStatus = "in_progress" | "completed" | "dropped";

export interface Consultation {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  mode: ConsultationMode;
  status: ConsultationStatus;
  startedAt?: string;
  endedAt?: string;
  // TODO: signaling/session fields depend on the WebRTC signaling design
  // (Supervisor Guide, Section 8 — open decision). Not yet defined.
}
