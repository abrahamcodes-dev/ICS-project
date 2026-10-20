export interface ConsultationRating { consultationId: string; score: number; comment: string; createdAt: number }
export interface DoctorRatingSummary { count: number; average: number | null }
