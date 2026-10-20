export type NotificationKind = 'booking' | 'cancellation' | 'reminder' | 'verification_approved' | 'verification_rejected' | 'message' | 'prescription';
export interface NotificationItem { id: string; kind: NotificationKind; createdAt: number; read: boolean }
export interface NotificationPage { items: NotificationItem[]; nextCursor: string | null }
export interface NotificationTarget { target: 'appointments' | 'consultation' | 'prescriptions' | 'verification'; appointmentId?: string }
