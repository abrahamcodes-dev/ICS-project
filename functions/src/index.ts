export { completeRegistration } from "./auth/completeRegistration";
export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";
export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";
export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";
export { replaceDoctorAvailabilityDay, getAvailableAppointmentTimes } from "./scheduling/availabilityCallables";
export { bookAppointment } from "./scheduling/bookingCallable";
export { cancelAppointment, recordAppointmentOutcome } from "./scheduling/lifecycleCallables";
// Later-workflow callables remain in source but are inactive pending authorization
// and workflow design. Never export onUserCreate or operator provisioning here.
