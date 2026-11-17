const mockGet=jest.fn();
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({doc:(_,collection,id)=>({collection,id}),getDocFromServer:(ref)=>mockGet(ref),
  Timestamp:class {constructor(ms){this.ms=ms;}toMillis(){return this.ms;}}}));
const {Timestamp}=require('firebase/firestore');
const {readConsultationHistory}=require('../src/services/consultationHistory');
const id='a'.repeat(64),t=ms=>new Timestamp(ms);
let appointment,room;
beforeEach(()=>{
 appointment={schemaVersion:1,appointmentId:id,patientId:'p',doctorId:'d',status:'completed',startAt:t(1000),endAt:t(2000)};
 room={schemaVersion:1,consultationId:id,appointmentId:id,patientId:'p',doctorId:'d',state:'closed',appointmentStartAt:t(1000),appointmentEndAt:t(2000),createdAt:t(1000),closedAt:t(2100)};
 mockGet.mockReset().mockImplementation(async ref=>({exists:()=>true,data:()=>ref.collection==='appointments'?appointment:room}));
});
test.each([['p','patient'],['d','doctor']])('owned completed history is read-only: %s',async(uid,role)=>{
 expect(await readConsultationHistory(id,uid,role)).toMatchObject({state:'closed',canSend:false,patientId:'p',doctorId:'d'});
 expect(mockGet.mock.calls.map(([ref])=>ref.collection)).toEqual(['appointments','consultations']);
});
test.each(['scheduled','cancelled','no_show'])('rejects noncompleted %s without reading room',async status=>{
 appointment.status=status;await expect(readConsultationHistory(id,'p','patient')).rejects.toThrow();expect(mockGet).toHaveBeenCalledTimes(1);
});
test.each([['x','patient'],['p','doctor'],['d','patient']])('rejects unrelated or wrong-role actor %s/%s',async(uid,role)=>{
 await expect(readConsultationHistory(id,uid,role)).rejects.toThrow();expect(mockGet).toHaveBeenCalledTimes(1);
});
test.each([{state:'active'},{patientId:'other'},{appointmentId:'b'.repeat(64)},{appointmentEndAt:t(3000)},{closedAt:null}])('rejects inconsistent room %j',async change=>{
 Object.assign(room,change);await expect(readConsultationHistory(id,'p','patient')).rejects.toThrow();
});
test('propagates Rules denial without a fallback or room-opening callable',async()=>{
 mockGet.mockRejectedValue(new Error('permission-denied'));await expect(readConsultationHistory(id,'p','patient')).rejects.toThrow('permission-denied');expect(mockGet).toHaveBeenCalledTimes(1);
});
test('invalid IDs do not issue requests',async()=>{await expect(readConsultationHistory('bad','p','patient')).rejects.toThrow();expect(mockGet).not.toHaveBeenCalled();});
