let mockAuthListener;
const mockCall=jest.fn();
jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:{uid:'patient'}},functions:{local:true}}));
jest.mock('firebase/auth',()=>({onAuthStateChanged:jest.fn((_,callback)=>{mockAuthListener=callback;return jest.fn();})}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn(()=>mockCall)}));
jest.mock('expo-modules-core',()=>({...jest.requireActual('expo-modules-core'),uuid:{v4:()=> '11111111-1111-4111-8111-111111111111'}}));
const {auth}=require('../src/services/firebaseConfig'),{httpsCallable}=require('firebase/functions');
const {createSchedulingSession,discoveryPartitions,localDateRange,localDate,windowInputs,SLOT_MS}=require('../src/services/schedulingService');
const id='a'.repeat(64),start=Math.ceil((Date.now()+3600000)/SLOT_MS)*SLOT_MS;
const result=()=>({appointmentId:id,doctorId:'doctor',startAt:start,endAt:start+SLOT_MS,status:'scheduled',replayed:false});
let session;
beforeEach(()=>{jest.clearAllMocks();auth.currentUser={uid:'patient'};session=createSchedulingSession('patient');});
afterEach(()=>session.dispose());
test('directory uses connected Functions instance and explicit DTO',async()=>{
 mockCall.mockResolvedValue({data:{items:[{uid:'doctor',professionalName:'Doctor',specialty:'Medicine'}],nextCursor:null}});
 expect((await session.listDoctors()).items).toHaveLength(1);
 expect(httpsCallable).toHaveBeenCalledWith({local:true},'listApprovedDoctors');expect(mockCall).toHaveBeenCalledWith({limit:10});
});
test.each([{items:[],nextCursor:'same'},{items:[{uid:'doctor',professionalName:'Doctor',specialty:'Medicine',private:true}],nextCursor:null},{items:[],nextCursor:'../bad'}])('invalid directory response %p',async data=>{
 mockCall.mockResolvedValue({data});await expect(session.listDoctors('same')).rejects.toThrow();
});
test('empty directory continuation is accepted for excluded records',async()=>{
 mockCall.mockResolvedValue({data:{items:[],nextCursor:'next'}});expect(await session.listDoctors()).toEqual({items:[],nextCursor:'next'});
});
test('own day returns null or validated windows',async()=>{
 mockCall.mockResolvedValueOnce({data:{day:null}});expect(await session.ownDay('2026-10-20')).toEqual({day:null});
 const data={day:{utcDate:'2026-10-20',revision:2,timeZone:'UTC',windows:[]}};
 mockCall.mockResolvedValue({data});expect(await session.ownDay('2026-10-20')).toEqual(data);
 await expect(session.ownDay('2026-02-30')).rejects.toThrow();
 data.day.revision=0;await expect(session.ownDay('2026-10-20')).rejects.toThrow();
});
test('replacement sends revision without owner and validates response',async()=>{
 const input={utcDate:'2026-10-20',timeZone:'UTC',expectedRevision:2,windows:[]};
 mockCall.mockResolvedValue({data:{availabilityId:id,revision:3,changed:true}});
 expect(await session.replace(input)).toEqual({availabilityId:id,revision:3,changed:true});expect(mockCall).toHaveBeenCalledWith(input);
 mockCall.mockResolvedValue({data:{availabilityId:'bad',revision:3,changed:true}});await expect(session.replace(input)).rejects.toThrow();
});
test('same logical booking retries preserve UUID, changed intent generates new UUID',async()=>{
 session.dispose();const make=jest.fn().mockReturnValueOnce('11111111-1111-4111-8111-111111111111').mockReturnValueOnce('22222222-2222-4222-8222-222222222222');session=createSchedulingSession('patient',make);
 session.selectBooking('doctor',start);mockCall.mockRejectedValueOnce({code:'functions/deadline-exceeded'});
 await expect(session.book()).rejects.toBeDefined();session.selectBooking('doctor',start);
 mockCall.mockResolvedValue({data:result()});await session.book();expect(mockCall.mock.calls[0][0]).toEqual(mockCall.mock.calls[1][0]);expect(make).toHaveBeenCalledTimes(1);
 session.selectBooking('doctor',start+SLOT_MS);mockCall.mockResolvedValue({data:{...result(),startAt:start+SLOT_MS,endAt:start+2*SLOT_MS}});await session.book();expect(make).toHaveBeenCalledTimes(2);
});
test('concurrent duplicate taps share one pending request',async()=>{
 let resolve;mockCall.mockImplementation(()=>new Promise(r=>{resolve=r;}));session.selectBooking('doctor',start);
 const a=session.book(),b=session.book();expect(a).toBe(b);expect(mockCall).toHaveBeenCalledTimes(1);
 expect(()=>session.selectBooking('other',start)).toThrow();resolve({data:result()});await a;
});
test.each(['dispose','logout'])('late booking response rejected after %s',async action=>{
 let resolve;mockCall.mockImplementation(()=>new Promise(r=>{resolve=r;}));session.selectBooking('doctor',start);const pending=session.book();
 if(action==='dispose')session.dispose();else mockAuthListener(null);
 resolve({data:result()});await expect(pending).rejects.toThrow('session ended');
});
test.each([{doctorId:'other'},{startAt:0},{status:'booked'},{appointmentId:'bad'},{replayed:1}])('booking rejects response mismatch %p',async patch=>{
 session.selectBooking('doctor',start);mockCall.mockResolvedValue({data:{...result(),...patch}});await expect(session.book()).rejects.toThrow();
});
test('cancellation uses ownerless contract and preserves normalized reason on retry',async()=>{
 mockCall.mockResolvedValue({data:{appointmentId:id,status:'cancelled',replayed:false}});
 await session.cancel(id,'  Changed plans  ');expect(mockCall).toHaveBeenCalledWith({appointmentId:id,reason:'Changed plans'});
 await expect(session.cancel(id,'a'.repeat(501))).rejects.toThrow();
 mockCall.mockResolvedValue({data:{appointmentId:id,status:'completed',replayed:false}});await expect(session.cancel(id)).rejects.toThrow();
});
test('local date fetches overlapping UTC partitions, filters outside local date',async()=>{
 const day=localDate(start),range=discoveryPartitions(day);
 const slot={doctorId:'doctor',startAt:start,endAt:start+SLOT_MS,availabilityId:id,availabilityRevision:1};
 mockCall.mockResolvedValue({data:{times:[slot]}});expect(await session.times('doctor',day)).toEqual([slot]);
 expect(mockCall).toHaveBeenCalledWith({doctorId:'doctor',fromDate:range.fromDate,days:range.days});
 const bounds=localDateRange(day);expect(start>=bounds.start&&start<bounds.end).toBe(true);
});
test('past local date causes no discovery request',async()=>{
 expect(await session.times('doctor','2000-01-01')).toEqual([]);expect(mockCall).not.toHaveBeenCalled();
});
test('wrong-doctor and duplicate slots rejected',async()=>{
 const slot={doctorId:'other',startAt:start,endAt:start+SLOT_MS,availabilityId:id,availabilityRevision:1};
 mockCall.mockResolvedValue({data:{times:[slot]}});await expect(session.times('doctor',localDate(start))).rejects.toThrow();
 slot.doctorId='doctor';mockCall.mockResolvedValue({data:{times:[slot,slot]}});await expect(session.times('doctor',localDate(start))).rejects.toThrow();
});
test('window conversion sorts, supports end midnight, rejects overlap and misalignment',()=>{
 expect(windowInputs('2026-10-20',[{start:'23:30',end:'24:00'},{start:'10:00',end:'10:30'}])).toHaveLength(2);
 expect(()=>windowInputs('2026-10-20',[{start:'10:00',end:'11:00'},{start:'10:30',end:'11:30'}])).toThrow();
 expect(()=>windowInputs('2026-10-20',[{start:'10:15',end:'11:00'}])).toThrow();
 expect(()=>windowInputs('2026-10-20',Array(9).fill({start:'10:00',end:'11:00'}))).toThrow();
});
