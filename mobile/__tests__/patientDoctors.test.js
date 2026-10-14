jest.mock('../src/services/firebaseConfig',()=>({app:{},db:{}}));
jest.mock('firebase/firestore',()=>({doc:jest.fn((db,...path)=>path),getDoc:jest.fn()}));
jest.mock('firebase/functions',()=>({getFunctions:jest.fn(()=>({})),httpsCallable:jest.fn()}));
const {doc,getDoc}=require('firebase/firestore'),{httpsCallable}=require('firebase/functions');
const {getPatientDoctor,getDoctorTimes}=require('../src/services/patientDoctors');
beforeEach(()=>jest.clearAllMocks());
test('reads only authorized public projection and drops private/unexpected fields',async()=>{
 getDoc.mockResolvedValue({exists:()=>true,data:()=>({uid:'doctor',schemaVersion:1,professionalName:'Dr Test',specialty:'General',private:'not returned'})});
 expect(await getPatientDoctor('doctor')).toEqual({uid:'doctor',professionalName:'Dr Test',specialty:'General'});
 expect(doc).toHaveBeenCalledWith({},'doctorPublicProfiles','doctor');
});
test('denied doctor access is not replaced with mock data',async()=>{
 getDoc.mockRejectedValue(new Error('permission-denied'));await expect(getPatientDoctor('doctor')).rejects.toThrow();
});
test('availability uses existing bounded callable contract and rejects wrong doctor',async()=>{
 const call=jest.fn().mockResolvedValue({data:{times:[]}});httpsCallable.mockReturnValue(call);
 expect(await getDoctorTimes('doctor')).toEqual([]);expect(httpsCallable).toHaveBeenCalledWith({},'getAvailableAppointmentTimes');
 expect(call).toHaveBeenCalledWith({doctorId:'doctor',fromDate:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),days:7});
 call.mockResolvedValue({data:{times:[{doctorId:'other',startAt:1,endAt:2}]}});await expect(getDoctorTimes('doctor')).rejects.toThrow();
});
