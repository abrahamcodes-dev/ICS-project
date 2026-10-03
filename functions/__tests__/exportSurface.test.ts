import { readFileSync } from "fs";
import { resolve } from "path";
test("only registration, doctor drafts, credentials and secured verification are exported",()=>{
 const source=readFileSync(resolve(__dirname,"../src/index.ts"),"utf8");
 expect(source.split(/\r?\n/).filter(line=>line.trim().startsWith("export ")))
 .toEqual(['export { completeRegistration } from "./auth/completeRegistration";',
  'export { saveDoctorProfileDraft } from "./profiles/saveDoctorProfileDraft";',
  'export { prepareDoctorCredential, finalizeDoctorCredential } from "./profiles/credentialCallables";',
  'export { submitDoctorVerification, reviewDoctorVerification } from "./profiles/verificationCallables";']);
});
