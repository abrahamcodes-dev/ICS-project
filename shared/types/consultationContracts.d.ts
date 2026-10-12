import type { DomainTimestamp } from './profiles';
import type { AppointmentStatus } from './scheduling';
export interface ConsultationAppointment {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly startAt: DomainTimestamp;
  readonly endAt: DomainTimestamp;
  readonly status: AppointmentStatus;
}
interface ConsultationBase {
  readonly consultationId: string;
  readonly appointmentId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly appointmentStartAt: DomainTimestamp;
  readonly appointmentEndAt: DomainTimestamp;
  readonly createdAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
export type Consultation = ConsultationBase & (
  | { readonly state: 'active'; readonly closedAt: null }
  | { readonly state: 'closed'; readonly closedAt: DomainTimestamp }
);
export interface ConsultationMessage {
  readonly messageId: string;
  readonly senderId: string;
  readonly type: 'text';
  readonly text: string;
  readonly createdAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
/** Private backend state; never expose to clients. */
export interface ConsultationSendState {
  readonly consultationId: string;
  readonly senderId: string;
  readonly lastAcceptedAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
export interface OpenConsultationInput { appointmentId: string }
export interface SendConsultationMessageInput { consultationId: string; messageRequestId: string; text: string }
/** Resolved from authoritative C4 terminal metadata, never request data. */
export interface ConsultationClosureContext { readonly terminalDecisionAt?: DomainTimestamp }
