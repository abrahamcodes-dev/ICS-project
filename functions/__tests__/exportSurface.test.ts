import { readFileSync } from "fs";
import { resolve } from "path";
test("only the approved backend callables are exported",()=>{
 const source=readFileSync(resolve(__dirname,"../src/index.ts"),"utf8");
 expect(source.split(/\r?\n/).filter(line=>line.trim().startsWith("export ")))
 .toEqual(['export { completeRegistration } from "./auth/completeRegistration";',
  "export {manageAcademicDemoTester} from './auth/academicAdministration';",
  "export {uploadAcademicDemoObject,readAcademicDemoCredential} from './profiles/academicUploads';",
  "export {academicBeforeCreate,academicBeforeSignIn} from './auth/academicBlocking';",
  'export { signInWithGoogle } from "./auth/googleSignIn";',
  "export { getConsultationFee, setDoctorConsultationFee, createConsultationCheckout, submitSimulatedPaymentDecision, getConsultationPayment, cancelConsultationPayment, retryConsultationRefund, listConsultationPayments, getDoctorPaymentSummary, reconcileConsultationPayments } from \"./payments/callables\";",
  'export { requestOwnAccountDeletion, getOwnAccountDeletion, resumeAccountDeletions } from "./accounts/deletionCallables";',
  'export { getOwnPatientConsent, updateOwnPatientConsent } from "./privacy/consentCallables";',
  'export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";',
  'export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";',
  'export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";',
  'export { listPendingDoctorVerifications } from "./profiles/verificationQueueCallable";',
  'export { replaceDoctorAvailabilityDay, replaceDoctorAvailabilityDays, getAvailableAppointmentTimes } from "./scheduling/availabilityCallables";',
  'export { listApprovedDoctors, getOwnDoctorAvailabilityDay } from "./scheduling/readCallables";',
  'export { bookAppointment } from "./scheduling/bookingCallable";',
  'export { cancelAppointment, recordAppointmentOutcome } from "./scheduling/lifecycleCallables";',
  'export { openConsultation } from "./consultations/openConsultation";',
  'export { sendConsultationMessage } from "./consultations/sendConsultationMessage";',
  'export { prepareConsultationAttachment, uploadConsultationAttachment, finalizeConsultationAttachment, getConsultationAttachment, discardConsultationAttachment, cleanupConsultationAttachments } from "./consultations/attachmentCallables";',
  'export { startConsultationCall } from "./consultations/calls/startConsultationCall";',
  'export { respondToConsultationCall, endConsultationCall, getConsultationCall } from "./consultations/calls/lifecycleCallables";',
  'export { publishConsultationIce } from "./consultations/calls/publishConsultationIce";',
  'export { issuePrescription, getConsultationPrescription } from "./prescriptions/issuePrescription";',
  'export { rateDoctor, getOwnConsultationRating, getOwnDoctorRatingSummary } from "./ratings/rateDoctor";',
  'export { listNotifications, markNotificationRead, openNotification, setNotificationDevice } from "./notifications/callables";',
  'export { changeProfileAvatar, getProfileAvatar } from "./profiles/avatarCallables";']);
 expect(source).not.toMatch(/integrationEntry|c6-emulator|FUNCTIONS_EMULATOR/);
});
