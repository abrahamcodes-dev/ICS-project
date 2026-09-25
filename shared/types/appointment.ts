export interface AvailabilitySlot {
  id: string;
  doctorId: string;
  startTime: string;   // ISO timestamp
  endTime: string;
  isBooked: boolean;
}

export type AppointmentStatus = "booked" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  status: AppointmentStatus;
  createdAt: string;
}
