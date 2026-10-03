export { completeRegistration } from "./auth/completeRegistration";
export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";
export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";
export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";
// Later-workflow callables remain in source but are inactive pending authorization
// and workflow design. Never export onUserCreate or operator provisioning here.
