const mockCallable=jest.fn(),mockSnapshot=jest.fn(),mockGetDoc=jest.fn();
jest.mock('firebase/functions',()=>({getFunctions:()=>({}),httpsCallable:jest.fn(()=>mockCallable)}));
jest.mock('firebase/firestore',()=>({doc:(_, ...p)=>p.join('/'),collection:(_, ...p)=>p.join('/'),getDoc:mockGetDoc,onSnapshot:mockSnapshot,
 query:(...x)=>x,where:(...x)=>({where:x}),limit:n=>({limit:n})}));
jest.mock('../src/services/firebaseConfig',()=>({app:{},db:{}}));
const {callSignaling,parseCall}=require('../src/services/calls/signaling');
const {httpsCallable}=require('firebase/functions');
const room='a'.repeat(64),cid='b'.repeat(64),ts={seconds:1,nanoseconds:123};
const call=()=>({callId:cid,consultationId:room,appointmentId:room,patientId:'p',doctorId:'d',initiatorId:'p',recipientId:'d',mode:'audio',state:'ringing',schemaVersion:1,
 createdAt:ts,ringExpiresAt:{seconds:61,nanoseconds:123},expiresAt:{seconds:300,nanoseconds:0},acceptedAt:null,endedAt:null,endReason:null});
beforeEach(()=>jest.clearAllMocks());
test.each([['start','startConsultationCall'],['respond','respondToConsultationCall'],['end','endConsultationCall']])('%s uses existing callable without authority fields',async(method,name)=>{
 mockCallable.mockResolvedValue({data:{call:call(),replayed:true}});const input={consultationId:room,requestId:'same-uuid'};
 await callSignaling[method](input);expect(httpsCallable).toHaveBeenLastCalledWith({},name);expect(mockCallable).toHaveBeenCalledWith(input);
});
test('get and publish preserve metadata-only contract and exact input',async()=>{
 mockCallable.mockResolvedValueOnce({data:{call:null}});expect(await callSignaling.get({consultationId:room})).toEqual({call:null});
 expect(httpsCallable).toHaveBeenLastCalledWith({},'getConsultationCall');
 mockCallable.mockResolvedValueOnce({data:{call:call(),replayed:false,candidateIds:['c'.repeat(64)]}});
 const input={consultationId:room,callId:cid,requestId:'stable',candidates:[{candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0}]};
 await callSignaling.publish(input);expect(httpsCallable).toHaveBeenLastCalledWith({},'publishConsultationIce');expect(mockCallable).toHaveBeenLastCalledWith(input);
});
test('metadata parser preserves timestamp precision, strips unknown private fields, rejects binding mismatch',()=>{
 expect(parseCall({...call(),receipt:'private'},room)).toEqual(call());expect(parseCall(call(),room).createdAt.nanoseconds).toBe(123);
 expect(()=>parseCall(call(),'c'.repeat(64))).toThrow();expect(()=>parseCall({...call(),state:'accepted'},room)).toThrow();
});
test('metadata listener skips cached state, handles malformed data, and returns unsubscribe',()=>{
 const stop=jest.fn(),next=jest.fn(),error=jest.fn();mockSnapshot.mockReturnValue(stop);
 expect(callSignaling.watch(call(),next,error)).toBe(stop);const args=mockSnapshot.mock.calls[0];
 expect(args[0]).toBe(`consultations/${room}/calls/${cid}`);
 args[2]({metadata:{fromCache:true},data:call});expect(next).not.toHaveBeenCalled();
 args[2]({metadata:{fromCache:false},data:call});expect(next).toHaveBeenCalledWith(call());
 args[2]({metadata:{fromCache:false},data:()=>null});expect(error).toHaveBeenCalled();
});
test('remote-only candidate subscription bounded at 128, no private-state or collection listing',()=>{
 const next=jest.fn(),error=jest.fn();callSignaling.ice(call(),'d',next,error);const args=mockSnapshot.mock.calls[0];
 expect(args[0]).toEqual([`consultations/${room}/calls/${cid}/candidates`,{where:['senderId','==','d']},{limit:128}]);
 args[1]({docs:[{id:'c'.repeat(64),data:()=>({schemaVersion:1,senderId:'d',sequence:2,candidate:'candidate:2',sdpMid:'0',sdpMLineIndex:0})}]});
 expect(next.mock.calls[0][0][0]).toMatchObject({sequence:2,id:'c'.repeat(64)});
 args[1]({docs:[{id:'c'.repeat(64),data:()=>({senderId:'intruder'})}]});expect(error).toHaveBeenCalled();
});
test('immutable SDP uses only fixed document paths and validates sender',async()=>{
 mockGetDoc.mockResolvedValue({exists:()=>true,data:()=>({schemaVersion:1,type:'offer',sdp:'v=0\r\nsynthetic',senderId:'p'})});
 expect(await callSignaling.description(call(),'offer')).toEqual({type:'offer',sdp:'v=0\r\nsynthetic'});
 expect(mockGetDoc).toHaveBeenCalledWith(`consultations/${room}/calls/${cid}/descriptions/offer`);
 mockGetDoc.mockResolvedValue({exists:()=>true,data:()=>({schemaVersion:1,type:'answer',sdp:'v=0\r\nsynthetic',senderId:'p'})});
 await expect(callSignaling.description(call(),'answer')).rejects.toThrow();
});
