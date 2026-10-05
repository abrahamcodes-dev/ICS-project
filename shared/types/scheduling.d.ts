import type { DomainTimestamp, DomainDocument } from './profiles';

/** SDK-independent domain values; adapters must persist real Firestore Timestamps. */
export interface SchedulingInterval { readonly startAt: DomainTimestamp; readonly endAt: DomainTimestamp }
/** Public transport uses integer epoch milliseconds, never local datetime strings. */
export interface AvailabilityWindowInput { startAt: number; endAt: number }
export interface AvailabilityReplacementInput {
  utcDate: string;
  timeZone: string;
  windows: AvailabilityWindowInput[];
  expectedRevision: number;
}
export interface DoctorAvailability extends DomainDocument {
  readonly doctorId: string;
  readonly utcDate: string;
  readonly timeZone: string;
  readonly windows: readonly SchedulingInterval[];
  readonly revision: number;
}
export interface BookingRequest { doctorId: string; startAt: number; bookingRequestId: string }
export interface CancelAppointmentInput { appointmentId: string; reason?: string | null }
export interface RecordAppointmentOutcomeInput { appointmentId: string; outcome: 'completed' | 'no_show' }
export interface AppointmentLifecycleResult {
  appointmentId: string;
  status: Exclude<AppointmentStatus, 'scheduled'>;
  replayed: boolean;
}
export interface BookingResult {
  appointmentId: string;
  doctorId: string;
  startAt: number;
  endAt: number;
  status: AppointmentStatus;
  replayed: boolean;
}
export interface AvailabilityReplacementResult { availabilityId: string; revision: number; changed: boolean }
/** fromDate is a UTC date partition; days is an inclusive partition count, 1 through 7. */
export interface AvailabilityDiscoveryInput { doctorId: string; fromDate: string; days: number }
/** Candidate only. Booking must recheck authorization, coverage and occupancy transactionally. */
export interface AvailableAppointmentTime {
  doctorId: string;
  startAt: number;
  endAt: number;
  availabilityId: string;
  availabilityRevision: number;
}
export interface AvailabilityDiscoveryResult { times: AvailableAppointmentTime[] }
export interface AppointmentDoctorDisplay { readonly professionalName: string; readonly specialty: string }
export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed' | 'no_show';
export interface AppointmentCancellation {
  readonly cancelledBy: string;
  readonly cancelledAt: DomainTimestamp;
  readonly reason: string | null;
}
export interface AppointmentOutcome { readonly recordedBy: string; readonly recordedAt: DomainTimestamp }
interface AppointmentBase extends DomainDocument, SchedulingInterval {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly availabilityId: string;
  readonly availabilityRevision: number;
  readonly doctorDisplay: AppointmentDoctorDisplay;
}
export type Appointment = AppointmentBase & (
  | { readonly status: 'scheduled'; readonly cancellation: null; readonly outcome: null }
  | { readonly status: 'cancelled'; readonly cancellation: AppointmentCancellation; readonly outcome: null }
  | { readonly status: 'completed' | 'no_show'; readonly cancellation: null; readonly outcome: AppointmentOutcome }
);
export type BookingResourceType = 'doctor' | 'patient';
/** Current reservation ownership, not history or a TTL lease. Terminal transitions release both locks. */
export interface BookingLock extends SchedulingInterval {
  readonly resourceType: BookingResourceType;
  readonly resourceId: string;
  readonly appointmentId: string;
  readonly schemaVersion: 1;
  readonly createdAt: DomainTimestamp;
}
/** Trusted handler-resolved participant category; not a public authorization claim. */
export interface SchedulingActor { uid: string; role: 'patient' | 'doctor' | 'administrator' }
export type AppointmentDecision =
  | { status: 'cancelled'; reason?: string | null }
  | { status: 'completed' | 'no_show'; reason?: never };
