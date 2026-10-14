let mockNext,mockError;
const mockStop=jest.fn();
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({
 Timestamp:class {constructor(ms){this.ms=ms;}toMillis(){return this.ms;}},
 collection:jest.fn((_,name)=>name),where:jest.fn((...a)=>a),orderBy:jest.fn((...a)=>a),limit:jest.fn(n=>n),query:jest.fn((...a)=>a),
 onSnapshot:jest.fn((q,next,error)=>{mockNext=next;mockError=error;return mockStop;})
}));
const {Timestamp,query}=require('firebase/firestore');
const {parseAppointment,consultationUnavailable,observeAppointments}=require('../src/services/appointmentReads');
const id='a'.repeat(64),data=()=>({appointmentId:id,patientId:'p',doctorId:'d',schemaVersion:1,startAt:new Timestamp(1000),endAt:new Timestamp(1801000),status:'scheduled'});
beforeEach(()=>jest.clearAllMocks());
test.each(['patient','doctor'])('%s uses bounded participant query and same appointment ID',role=>{
 const uid=role==='patient'?'p':'d',next=jest.fn();const stop=observeAppointments(uid,role,next,jest.fn());
 expect(query).toHaveBeenCalledWith('appointments',[`${role}Id`,'==',uid],['startAt','desc'],50);
 mockNext({docs:[{id,data}]});expect(next.mock.calls[0][0][0].appointmentId).toBe(id);stop();
});
test('unrelated or corrupt document fails closed',()=>{
 expect(()=>parseAppointment(id,data(),'other','patient')).toThrow();
 expect(()=>parseAppointment(id,{...data(),status:'booked'},'p','patient')).toThrow();
});
test.each(['cancelled','completed','no_show'])('%s disables entry',status=>{
 const row=parseAppointment(id,{...data(),status},'p','patient');expect(consultationUnavailable(row,'p','patient',2000)).toMatch(/appointment is/);
});
test('start inclusive and end plus grace exclusive; unrelated entry denied',()=>{
 const row=parseAppointment(id,data(),'p','patient');
 expect(consultationUnavailable(row,'p','patient',999)).toMatch(/start time/);
 expect(consultationUnavailable(row,'p','patient',1000)).toBeNull();
 expect(consultationUnavailable(row,'p','patient',2701000)).toMatch(/expired/);
 expect(consultationUnavailable(row,'other','patient',2000)).toMatch(/belong/);
});
test('cleanup ignores late responses and errors',()=>{
 const next=jest.fn(),error=jest.fn(),stop=observeAppointments('p','patient',next,error);stop();mockNext({docs:[{id,data}]});mockError();
 expect(next).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(mockStop).toHaveBeenCalledTimes(1);
});
