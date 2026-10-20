const mockCall = jest.fn(), mockAuth = {currentUser:{uid:'doctor'}};
let mockRefresh;
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn(()=>mockCall)}));
jest.mock('../src/services/firebaseConfig',()=>({auth:mockAuth,functions:{}}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockRefresh=fn;return jest.fn();}}));
const {createPrescriptionSession,validateMedication}=require('../src/services/prescriptionService');
const {httpsCallable}=require('firebase/functions');
const cid='a'.repeat(64), med={name:'Synthetic',dosage:'Entry',frequency:'Entry',duration:'Entry',instructions:'Entry'};
const p={prescriptionId:cid,consultationId:cid,appointmentId:cid,doctorId:'doctor',patientId:'patient',medications:[med],issuedAt:123,schemaVersion:1};
beforeEach(()=>{jest.clearAllMocks();mockCall.mockReset();mockAuth.currentUser={uid:'doctor'};});
test('callable reads and issues only; checks bindings and omits receipt',async()=>{
 const s=createPrescriptionSession('doctor',cid);mockCall.mockResolvedValue({data:{prescription:p,replayed:false}});
 expect(await s.get()).toEqual(p);expect(httpsCallable).toHaveBeenCalledWith({},'getConsultationPrescription');
 expect(await s.issue([med])).toEqual(p);expect(httpsCallable).toHaveBeenLastCalledWith({},'issuePrescription');
 expect(mockCall.mock.calls[1][0]).toEqual({consultationId:cid,requestId:expect.any(String),medications:[med]});s.dispose();
});
test('uncertain retry preserves UUID and rejects changed clinical content',async()=>{
 const s=createPrescriptionSession('doctor',cid);mockCall.mockRejectedValueOnce(Error('offline'));
 await expect(s.issue([med])).rejects.toThrow();
 expect(()=>s.issue([{...med,dosage:'Changed'}])).toThrow();
 mockCall.mockResolvedValue({data:{prescription:p,replayed:true}});
 await s.issue([med]);expect(mockCall.mock.calls[0][0]).toEqual(mockCall.mock.calls[1][0]);s.dispose();
});
test('parallel submissions share one promise and request',async()=>{
 const s=createPrescriptionSession('doctor',cid);mockCall.mockResolvedValue({data:{prescription:p,replayed:false}});
 const first=s.issue([med]),second=s.issue([med]);expect(first).toBe(second);await first;expect(mockCall).toHaveBeenCalledTimes(1);s.dispose();
});
test.each(['dispose','identity','account'])('late response rejected after %s',async kind=>{
 let resolve;const s=createPrescriptionSession('doctor',cid);mockCall.mockReturnValue(new Promise(r=>{resolve=r;}));
 const result=s.get();
 if(kind==='dispose')s.dispose();if(kind==='identity')mockRefresh();if(kind==='account')mockAuth.currentUser={uid:'other'};
 resolve({data:{prescription:p,replayed:false}});await expect(result).rejects.toThrow('Session changed');s.dispose();
});
test('cross-patient response is rejected',async()=>{
 mockAuth.currentUser={uid:'patient'};const s=createPrescriptionSession('patient',cid);
 mockCall.mockResolvedValue({data:{prescription:{...p,patientId:'other'},replayed:false}});
 await expect(s.get()).rejects.toThrow('Invalid prescription');s.dispose();
});
test('required fields and length are validated without treatment defaults',()=>{
 for(const key of Object.keys(med))expect(()=>validateMedication({...med,[key]:''})).toThrow();
 expect(()=>validateMedication({...med,instructions:'x'.repeat(1001)})).toThrow();
 expect(validateMedication(med)).toEqual(med);
});
