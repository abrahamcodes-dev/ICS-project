export interface Prescription {
  id: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  notes: string;
  medications: { name: string; dosage: string; instructions?: string }[];
  issuedAt: string;
}
