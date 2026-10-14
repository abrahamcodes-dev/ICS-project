export { completeRegistration } from "./auth/completeRegistration";
export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";
export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";
export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";
export { replaceDoctorAvailabilityDay, getAvailableAppointmentTimes } from "./scheduling/availabilityCallables";
export { bookAppointment } from "./scheduling/bookingCallable";
export { cancelAppointment, recordAppointmentOutcome } from "./scheduling/lifecycleCallables";
export { openConsultation } from "./consultations/openConsultation";
export { sendConsultationMessage } from "./consultations/sendConsultationMessage";
export { startConsultationCall } from "./consultations/calls/startConsultationCall";
export { respondToConsultationCall, endConsultationCall, getConsultationCall } from "./consultations/calls/lifecycleCallables";
export { publishConsultationIce } from "./consultations/calls/publishConsultationIce";
// Later-workflow callables remain in source but are inactive pending authorization
// and workflow design. Never export onUserCreate or operator provisioning here.
