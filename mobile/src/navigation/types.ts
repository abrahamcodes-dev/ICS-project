export type PatientStackParams = {
  HealthProfile: undefined; BookAppointment: undefined; Appointments: undefined;
  Consultation: {appointmentId: string}; Prescriptions: undefined;
  RateDoctor: undefined; Chatbot: undefined; Notifications: undefined;
};
export type DoctorStackParams = {
  SubmitVerification: undefined; SetAvailability: undefined; Appointments: undefined;
  ConsultationRoom: {appointmentId: string}; IssuePrescription: undefined; Notifications: undefined;
};
