export interface ApprovedDoctor { uid: string; professionalName: string; specialty: string }
/** Appointment-bound display data, never persisted in appointment documents. */
export interface AppointmentPatientDisplay {
  appointmentId: string;
  patientDisplayName: string | null;
  patientAvatar: string | null;
}
export interface DoctorDirectoryInput { limit?: number; after?: string }
export interface DoctorDirectoryPage { items: ApprovedDoctor[]; nextCursor: string | null }
export interface OwnAvailabilityInput { utcDate: string }
export interface OwnAvailabilityResult {
  day: null | { utcDate: string; timeZone: string; revision: number;
    windows: Array<{ startAt: number; endAt: number }> };
}
