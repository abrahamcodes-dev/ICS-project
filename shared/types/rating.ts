export interface Rating {
  id: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  score: number;       // 1-5
  comment?: string;
  createdAt: string;
}
