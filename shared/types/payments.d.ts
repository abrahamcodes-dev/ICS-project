export type PaymentStatus='created'|'pending'|'succeeded'|'failed'|'cancelled'|'expired'|'refund_pending'|'refunded'|'refund_failed'|'review_required';
export interface ConsultationFee {doctorId:string;amountMinor:number;currency:'KES';revision:number;demo:true;durationMinutes?:15|30|60;totalMinor?:number}
export interface PaymentView {
 paymentId:string;reservationId:string;appointmentId:string|null;doctorId:string;patientId:string;
 doctorDisplay:{professionalName:string;specialty:string};startAt:number;endAt:number;
 durationMinutes:15|30|60;amountMinor:number;currency:'KES';method:'simulated_mpesa';provider:'simulated-mpesa';status:PaymentStatus;
 providerReference:string|null;refundReference:string|null;reasonCode:string|null;
 createdAt:number;updatedAt:number;expiresAt:number;paidAt:number|null;demo:true;
}
