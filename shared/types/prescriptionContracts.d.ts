export interface PrescriptionMedication {
  name: string; dosage: string; frequency: string; duration: string; instructions: string;
}
export interface IssuePrescriptionInput {
  consultationId: string; requestId: string; medications: PrescriptionMedication[];
}
/** Callable DTO; private request ID is omitted. All content is clinician-entered. */
export interface Prescription {
  prescriptionId: string; consultationId: string; appointmentId: string;
  doctorId: string; patientId: string; medications: PrescriptionMedication[];
  issuedAt: number; schemaVersion: 1;
}
