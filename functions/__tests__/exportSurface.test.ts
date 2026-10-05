import { readFileSync } from "fs";
import { resolve } from "path";
test("only approved identity, profiles, verification and availability callables are exported",()=>{
 const source=readFileSync(resolve(__dirname,"../src/index.ts"),"utf8");
 expect(source.split(/\r?\n/).filter(line=>line.trim().startsWith("export ")))
 .toEqual(['export { completeRegistration } from "./auth/completeRegistration";',
  'export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";',
  'export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";',
  'export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";',
  'export { replaceDoctorAvailabilityDay, getAvailableAppointmentTimes } from "./scheduling/availabilityCallables";',
  'export { bookAppointment } from "./scheduling/bookingCallable";',
  'export { cancelAppointment, recordAppointmentOutcome } from "./scheduling/lifecycleCallables";']);
});
