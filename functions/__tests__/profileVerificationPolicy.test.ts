import { LIMITS, validatePatientProfileInput, validatePatientHealthInput, validateDoctorDraftInput,
 validateCredentialUploadInput, credentialPath, validateCredentialPath, validateReviewInput, timestamp } from "../src/profiles/domainValidation";
import { planDoctorDraft, planVerificationSubmission, planVerificationReview, requireProfessionalSnapshot,
 validateCredentialRecord } from "../src/profiles/verificationPolicy";
import type { DoctorCredentialRecord } from "../../shared/types/verification";
const now={seconds:1800000000,nanoseconds:0};
const professional={professionalName:"Doctor Name",specialty:"General medicine",registrationNumber:"REG-1",issuingAuthority:"Medical Authority"};
const draft=()=>planDoctorDraft("doctor",null,professional,0,"pending",now);
function credential(id="license",category:DoctorCredentialRecord["category"]="medical_license"):DoctorCredentialRecord {
 return {credentialId:id,doctorUid:"doctor",storagePath:credentialPath("doctor",id),category,contentType:"application/pdf",
 sizeBytes:LIMITS.credentialBytes,state:"ready",generation:"123",checksum:"a".repeat(64),requestId:null,
 expiresAt:{...now,seconds:now.seconds+3600},schemaVersion:1,createdAt:{...now},updatedAt:{...now}};
}
const submission=()=>planVerificationSubmission({profile:draft(),identityStatus:"pending",expectedRevision:1,
 requestId:"request-1",credentials:[credential()],previousRequest:null,now});
const review=(input:unknown={decision:"approved"})=>{
 const s=submission();
 return planVerificationReview({profile:s.profile,request:s.request,identityStatus:"pending",
 expectedRevision:1,input,reviewerUid:"reviewer",eventId:"event-1",now});
};
test("empty profiles and optional health fields",()=>{
 expect(validatePatientProfileInput({})).toEqual({});
 expect(validatePatientHealthInput({},"2026-10-01")).toEqual({});
 expect(validateDoctorDraftInput({})).toEqual({});
});
test("patient fields normalize",()=>{
 expect(validatePatientProfileInput({displayName:" Test ",phoneNumber:"+254 700-123456"}))
 .toEqual({displayName:"Test",phoneNumber:"+254 700-123456"});
});
test.each([null,[],{displayName:""},{displayName:"a".repeat(201)},{phoneNumber:"letters"},{phoneNumber:"1".repeat(33)},
 {displayName:undefined},{displayName:"bad\nname"},{phoneNumber:null}])("invalid patient input %#",value=>{
 expect(()=>validatePatientProfileInput(value)).toThrow();
});
test("maximum patient fields accepted",()=>{
 expect(validatePatientProfileInput({displayName:"a".repeat(200),phoneNumber:"1".repeat(32)}).displayName).toHaveLength(200);
});
test.each(["uid","role","email","status","verificationStatus","schemaVersion","createdAt","updatedAt","revision","activeRequestId","approvedRequestId","credentials","unknown"])("rejects injected %s in all public profile inputs",key=>{
 expect(()=>validatePatientProfileInput({[key]:"spoof"})).toThrow();
 expect(()=>validatePatientHealthInput({[key]:"spoof"},"2026-10-01")).toThrow();
 expect(()=>validateDoctorDraftInput({[key]:"spoof"})).toThrow();
});
test.each(["knownConditions","allergies","currentMedications"])("%s lists are bounded and copied",key=>{
 const items=Array(20).fill("a".repeat(200));
 const result=validatePatientHealthInput({[key]:items},"2026-10-01") as Record<string,string[]>;
 expect(result[key]).toHaveLength(20);expect(result[key]).not.toBe(items);
 expect(()=>validatePatientHealthInput({[key]:[...items,"extra"]},"2026-10-01")).toThrow();
 expect(()=>validatePatientHealthInput({[key]:["a".repeat(201)]},"2026-10-01")).toThrow();
 expect(()=>validatePatientHealthInput({[key]:[""]},"2026-10-01")).toThrow();
 expect(()=>validatePatientHealthInput({[key]:"not-list"},"2026-10-01")).toThrow();
});
test("empty health lists are retained as supplied",()=>{
 expect(validatePatientHealthInput({allergies:[]},"2026-10-01")).toEqual({allergies:[]});
});
test.each(["2025-02-29","2026-13-01","2026-10-02","01/01/2000",null])("invalid DOB %p",dateOfBirth=>{
 expect(()=>validatePatientHealthInput({dateOfBirth},"2026-10-01")).toThrow();
});
test("leap date and bounded gender accepted",()=>{
 expect(validatePatientHealthInput({dateOfBirth:"2000-02-29",gender:"g".repeat(50)},"2026-10-01").dateOfBirth).toBe("2000-02-29");
 expect(()=>validatePatientHealthInput({gender:"g".repeat(51)},"2026-10-01")).toThrow();
});
test.each([["professionalName",200],["specialty",120],["registrationNumber",120],["issuingAuthority",200]] as const)("draft %s boundary", (key,max)=>{
 expect(validateDoctorDraftInput({[key]:"a".repeat(max)})).toEqual({[key]:"a".repeat(max)});
 expect(()=>validateDoctorDraftInput({[key]:"a".repeat(max+1)})).toThrow();
 const fields:Record<string,string>={...professional}; delete fields[key];
 expect(()=>requireProfessionalSnapshot(fields)).toThrow("incomplete-professional-profile");
});
test("initial draft may be incomplete, submission may not",()=>{
 const profile=planDoctorDraft("doctor",null,{},0,"pending",now);
 expect(profile.activeRequestId).toBeNull();expect(profile.approvedRequestId).toBeNull();
 expect(()=>planVerificationSubmission({profile,identityStatus:"pending",expectedRevision:1,requestId:"r",credentials:[credential()],previousRequest:null,now})).toThrow();
});
test.each(["medical_license","professional_certificate","identity_document","other_supporting_document"])("credential category %s",category=>{
 expect(validateCredentialUploadInput({category,contentType:"application/pdf",sizeBytes:1}).category).toBe(category);
});
test.each(["application/pdf","image/jpeg","image/png"])("MIME %s",contentType=>{
 expect(validateCredentialUploadInput({category:"medical_license",contentType,sizeBytes:LIMITS.credentialBytes}).sizeBytes).toBe(5242880);
});
test.each([{category:"other"},{contentType:"image/svg+xml"},{contentType:"text/html"},{contentType:"image/jpg"},
 {sizeBytes:5242881},{sizeBytes:0},{sizeBytes:-1},{sizeBytes:1.5},{sizeBytes:NaN},{sizeBytes:"1"},{fileUrl:"https://example.test"}])("invalid credential input %#",extra=>{
 expect(()=>validateCredentialUploadInput({category:"medical_license",contentType:"application/pdf",sizeBytes:1,...extra})).toThrow();
});
test.each(["../escape","a/b","a\\b","..",""," x","a%2Fb","a%5Cb","a".repeat(129)])("unsafe ID %s",id=>{
 expect(()=>credentialPath(id,"credential")).toThrow();
 expect(()=>credentialPath("doctor",id)).toThrow();
});
test("exact Storage path and no download URL",()=>{
 expect(credentialPath("doctor","credential")).toBe("doctorCredentials/doctor/credential/document");
 expect(()=>validateCredentialPath("https://example.test","doctor","credential")).toThrow();
 expect(()=>validateCredentialPath(credentialPath("other","credential"),"doctor","credential")).toThrow();
});
test.each(["prepared","attached","invalid"] as const)("non-ready %s cannot be submitted",state=>{
 const record={...credential(),state,requestId:state==="attached"?"old":null};
 expect(()=>planVerificationSubmission({profile:draft(),identityStatus:"pending",expectedRevision:1,requestId:"r",credentials:[record],previousRequest:null,now})).toThrow();
});
test("prepared record permits only unfinalized metadata",()=>{
 const prepared={...credential(),state:"prepared" as const,generation:null,checksum:null};
 expect(()=>validateCredentialRecord(prepared)).not.toThrow();
 expect(()=>validateCredentialRecord({...prepared,generation:"1"})).toThrow();
});
test.each([{doctorUid:"other"},{storagePath:"wrong"},{checksum:null},{generation:null},{schemaVersion:2},{requestId:"other"}])("invalid finalized record %#",extra=>{
 expect(()=>planVerificationSubmission({profile:draft(),identityStatus:"pending",expectedRevision:1,requestId:"r",
 credentials:[{...credential(),...extra} as DoctorCredentialRecord],previousRequest:null,now})).toThrow();
});
test("one medical license mandatory; maximum five unique credentials",()=>{
 const plan=(credentials:DoctorCredentialRecord[])=>planVerificationSubmission({profile:draft(),identityStatus:"pending",expectedRevision:1,requestId:"r",credentials,previousRequest:null,now});
 expect(()=>plan([])).toThrow();
 expect(()=>plan([credential("id","identity_document")])).toThrow("medical-license-required");
 expect(()=>plan([credential(),credential()])).toThrow();
 expect(plan(Array.from({length:5},(_,i)=>credential("id"+i))).request.credentials).toHaveLength(5);
 expect(()=>plan(Array.from({length:6},(_,i)=>credential("id"+i)))).toThrow();
});
test("submission snapshot copies and freezes reviewed data, excluding phone",()=>{
 const profile=draft();const file=credential(); const s=planVerificationSubmission({profile:{...profile,phoneNumber:"123"},identityStatus:"pending",expectedRevision:1,requestId:"r",credentials:[file],previousRequest:null,now});
 profile.professionalName="Changed";(file as {checksum:string}).checksum="b".repeat(64);
 expect(s.request.professional.professionalName).toBe("Doctor Name");expect(s.request.credentials[0].checksum).toBe("a".repeat(64));
 expect(s.request.professional).not.toHaveProperty("phoneNumber");
 expect(Object.isFrozen(s.request)).toBe(true);expect(Object.isFrozen(s.request.professional)).toBe(true);
 expect(Object.isFrozen(s.request.credentials)).toBe(true);expect(Object.isFrozen(s.request.credentials[0])).toBe(true);
 expect(s.credentials[0].state).toBe("attached");expect(file.state).toBe("ready");
});
test.each([{decision:"approved",rejectionReason:"reason"},{decision:"approved",rejectionReason:undefined},
 {decision:"rejected"},{decision:"rejected",rejectionReason:""},{decision:"rejected",rejectionReason:"x".repeat(1001)},
 {decision:"rejected",rejectionReason:new Error("internal")},{decision:"other"},{decision:"approved",reviewerUid:"spoof"}])("invalid review input %#",input=>{
 expect(()=>validateReviewInput(input)).toThrow();
});
test("approval excludes private data; rejection stores bounded reason",()=>{
 const approved=review();expect(approved.identityVerificationStatus).toBe("approved");
 expect(approved.request).not.toHaveProperty("rejectionReason");
 expect(Object.keys(approved.publicProfile!).sort()).toEqual(["uid","professionalName","specialty","approvedRevision","approvedRequestId","schemaVersion","publishedAt","updatedAt"].sort());
 const rejected=review({decision:"rejected",rejectionReason:"r".repeat(1000)});
 expect(rejected.identityVerificationStatus).toBe("rejected");expect(rejected.publicProfile).toBeNull();
 expect(rejected.audit.actorUid).toBe("reviewer");
});
test("stale draft/submission/review and self-review rejected",()=>{
 expect(()=>planDoctorDraft("doctor",draft(),professional,0,"pending",now)).toThrow("stale-revision");
 expect(()=>planVerificationSubmission({profile:draft(),identityStatus:"pending",expectedRevision:2,requestId:"r",credentials:[credential()],previousRequest:null,now})).toThrow("stale-revision");
 const s=submission();const args={profile:s.profile,request:s.request,identityStatus:"pending" as const,expectedRevision:1,input:{decision:"approved"},reviewerUid:"reviewer",eventId:"event",now};
 expect(()=>planVerificationReview({...args,expectedRevision:2})).toThrow("stale-revision");
 expect(()=>planVerificationReview({...args,reviewerUid:"doctor"})).toThrow("self-review");
});
test("submitted draft locked, duplicate submission/review rejected",()=>{
 const s=submission();
 expect(()=>planDoctorDraft("doctor",s.profile,professional,1,"pending",now)).toThrow("submitted-draft-locked");
 expect(()=>planVerificationSubmission({profile:s.profile,identityStatus:"pending",expectedRevision:1,requestId:"r2",credentials:[credential()],previousRequest:null,now})).toThrow("invalid-transition");
 const a=review();
 expect(()=>planVerificationReview({profile:a.profile,request:a.request,identityStatus:"approved",expectedRevision:1,input:{decision:"approved"},reviewerUid:"reviewer",eventId:"e",now})).toThrow("invalid-transition");
});
test("approved professional fields locked; phone can be updated/removed without revision change",()=>{
 const a=review();
 expect(()=>planDoctorDraft("doctor",a.profile,{...professional,specialty:"Changed"},1,"approved",now)).toThrow("approved-professional-fields-locked");
 const updated=planDoctorDraft("doctor",a.profile,{...professional,phoneNumber:"123"},1,"approved",now);
 expect(updated.revision).toBe(1);
 const cleared=planDoctorDraft("doctor",updated,professional,1,"approved",now);
 expect(cleared).not.toHaveProperty("phoneNumber");
});
test("rejected resubmission needs new request and revised draft",()=>{
 const rejected=review({decision:"rejected",rejectionReason:"Unreadable license"});
 const profile=planDoctorDraft("doctor",rejected.profile,professional,1,"rejected",now);
 const args={profile,identityStatus:"rejected" as const,expectedRevision:2,requestId:"request-2",credentials:[credential("new-license")],previousRequest:rejected.request,now};
 const next=planVerificationSubmission(args);
 expect(next.request.previousRequestId).toBe("request-1");expect(next.request.profileRevision).toBe(2);
 expect(next.identityVerificationStatus).toBe("pending");expect(rejected.request.state).toBe("rejected");
 expect(()=>planVerificationSubmission({...args,requestId:"request-1"})).toThrow();
 expect(()=>planVerificationSubmission({...args,previousRequest:null})).toThrow();
 expect(()=>planVerificationSubmission({...args,profile:rejected.profile,expectedRevision:1})).toThrow();
});
test.each([{seconds:1.5,nanoseconds:0},{seconds:1,nanoseconds:-1},{seconds:1,nanoseconds:1000000000}])("invalid timestamp %#",value=>{
 expect(()=>timestamp(value)).toThrow();
});
test("domain timestamps remain structural, identity timestamp contract untouched",()=>{
 expect(draft().createdAt).toEqual(now);
 expect(()=>planDoctorDraft("doctor",draft(),professional,1,"pending",{...now,seconds:now.seconds-1})).toThrow("timestamp-order");
});

test("malformed locked profile cannot retain approval through contact edit",()=>{
 const invalid={...draft(),professionalName:undefined,approvedRequestId:"approved"};
 expect(()=>planDoctorDraft("doctor",invalid,{},1,"approved",now)).toThrow();
});
test.each([{generation:"not-generation"},{checksum:"not-checksum"},{requestId:"../other"}])("invalid credential metadata stays bounded %#",extra=>{
 expect(()=>validateCredentialRecord({...credential(),state:"invalid",...extra})).toThrow();
});
test("out-of-order and inconsistent reviews fail closed",()=>{
 const s=submission();
 const args={profile:s.profile,request:s.request,identityStatus:"pending" as const,expectedRevision:1,input:{decision:"approved"},reviewerUid:"reviewer",eventId:"event",now};
 expect(()=>planVerificationReview({...args,profile:{...s.profile,professionalName:"Changed"}})).toThrow("snapshot-conflict");
 expect(()=>planVerificationReview({...args,profile:{...s.profile,uid:"other"}})).toThrow("invalid-transition");
 expect(()=>planVerificationReview({...args,now:{...now,seconds:now.seconds-1}})).toThrow("timestamp-order");
 expect(()=>planVerificationReview({...args,request:{...s.request,state:"invalidated",reviewerUid:"reviewer",reviewedAt:now,invalidatedAt:now}})).toThrow("invalid-transition");
});
