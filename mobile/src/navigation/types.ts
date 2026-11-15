export type PatientStackParams = {
  Home: undefined; Doctors: {search?:string;specialty?:string} | undefined; Profile: undefined; DoctorProfile: {doctorId:string};
  HealthProfile: undefined; BookAppointment: {doctorId: string; startAt: number;durationMinutes?:15|30|60}; Appointments: undefined;
  Consultation: {appointmentId: string}; Prescriptions: undefined;
  RateDoctor: {consultationId: string}; Chatbot: undefined; Notifications: undefined;
};
export type DoctorStackParams = {
  DoctorWorkspace: undefined;
  SubmitVerification: undefined; SetAvailability: undefined; Appointments: undefined;
  ConsultationDetails: {appointmentId: string}; ConsultationRoom: {appointmentId: string}; IssuePrescription: {appointmentId:string} | undefined; Notifications: undefined;
};
