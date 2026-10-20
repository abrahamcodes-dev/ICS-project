export type PatientStackParams = {
  Home: undefined; Doctors: undefined; Profile: undefined; DoctorProfile: {doctorId:string};
  HealthProfile: undefined; BookAppointment: {doctorId: string; startAt: number}; Appointments: undefined;
  Consultation: {appointmentId: string}; Prescriptions: undefined;
  RateDoctor: {consultationId: string}; Chatbot: undefined; Notifications: undefined;
};
export type DoctorStackParams = {
  DoctorWorkspace: undefined;
  SubmitVerification: undefined; SetAvailability: undefined; Appointments: undefined;
  ConsultationRoom: {appointmentId: string}; IssuePrescription: undefined; Notifications: undefined;
};
