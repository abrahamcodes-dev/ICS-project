import { readFileSync } from "fs";
import { resolve } from "path";
test("only the nineteen approved backend callables are exported",()=>{
 const source=readFileSync(resolve(__dirname,"../src/index.ts"),"utf8");
 expect(source.split(/\r?\n/).filter(line=>line.trim().startsWith("export ")))
 .toEqual(['export { completeRegistration } from "./auth/completeRegistration";',
  'export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";',
  'export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";',
  'export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";',
  'export { listPendingDoctorVerifications } from "./profiles/verificationQueueCallable";',
  'export { replaceDoctorAvailabilityDay, getAvailableAppointmentTimes } from "./scheduling/availabilityCallables";',
  'export { bookAppointment } from "./scheduling/bookingCallable";',
  'export { cancelAppointment, recordAppointmentOutcome } from "./scheduling/lifecycleCallables";',
  'export { openConsultation } from "./consultations/openConsultation";',
  'export { sendConsultationMessage } from "./consultations/sendConsultationMessage";',
  'export { startConsultationCall } from "./consultations/calls/startConsultationCall";',
  'export { respondToConsultationCall, endConsultationCall, getConsultationCall } from "./consultations/calls/lifecycleCallables";',
  'export { publishConsultationIce } from "./consultations/calls/publishConsultationIce";']);
 expect(source).not.toMatch(/integrationEntry|c6-emulator|FUNCTIONS_EMULATOR/);
});
