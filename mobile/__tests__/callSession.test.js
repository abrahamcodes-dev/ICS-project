const {createCallSession} = require('../src/services/calls/session');
const room='a'.repeat(64), cid='b'.repeat(64);
const ts=ms=>({seconds:Math.floor(ms/1000),nanoseconds:(ms%1000)*1e6});
const ringing=()=>({callId:cid,consultationId:room,appointmentId:room,patientId:'patient',doctorId:'doctor',
 initiatorId:'patient',recipientId:'doctor',mode:'audio',schemaVersion:1,state:'ringing',createdAt:ts(0),
 ringExpiresAt:ts(60000),expiresAt:ts(120000),acceptedAt:null,endedAt:null,endReason:null});
const accepted=()=>({...ringing(),state:'accepted',acceptedAt:ts(1000)});
const ended=()=>({...accepted(),state:'ended',endedAt:ts(2000),endReason:'hangup'});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const drain=async()=>{for(let i=0;i<25;i++) await Promise.resolve();};
function fixture(uid='patient') {
 let next,ice,events,error,n=0;const states=[];
 const peer={offer:jest.fn(async()=>({type:'offer',sdp:'v=0\r\no=synthetic'})),answer:jest.fn(async()=>({type:'answer',sdp:'v=0\r\no=synthetic-answer'})),
 local:jest.fn(async()=>{}),remote:jest.fn(async()=>{}),candidate:jest.fn(async()=>{}),close:jest.fn()};
 const stop=jest.fn(),iceStop=jest.fn();
 const api={start:jest.fn(async()=>({call:ringing(),replayed:false})),get:jest.fn(async()=>({call:ringing()})),
 respond:jest.fn(async()=>({call:accepted(),replayed:false})),end:jest.fn(async()=>({call:ended(),replayed:false})),
 publish:jest.fn(async()=>({call:accepted(),replayed:false,candidateIds:['c'.repeat(64)]})),
 description:jest.fn(async(c,kind)=>({type:kind,sdp:'v=0\r\no=remote'})),
 watch:jest.fn((c,fn,err)=>{next=fn;error=err;return stop;}),ice:jest.fn((c,s,fn)=>{ice=fn;return iceStop;})};
 const session=createCallSession({consultationId:room,uid,signaling:api,requestId:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,
 createPeer:jest.fn((mode,e)=>{events=e;return peer;}),now:()=>Date.now()});
 session.subscribe(s=>states.push(s));
 return {session,peer,api,states,stop,iceStop,next:c=>next(c),ice:c=>ice(c),event:c=>events.ice(c),connection:c=>events.connection(c),error:e=>error(e)};
}
const candidate=(n=1)=>({candidate:`candidate:${n} synthetic`,sdpMid:'0',sdpMLineIndex:0});
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(0);});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
test('outgoing offer/local SDP precede start; ICE waits for acceptance and answer',async()=>{
 const f=fixture();await f.session.start('audio');f.event(candidate());expect(f.api.publish).not.toHaveBeenCalled();
 expect(f.peer.local).toHaveBeenCalledWith(f.api.start.mock.calls[0][0].offer);
 f.next(accepted());await drain();expect(f.peer.remote).toHaveBeenCalledTimes(1);
 expect(f.api.ice.mock.calls[0][1]).toBe('doctor');expect(f.api.publish).toHaveBeenCalledTimes(1);
 expect(f.states.at(-1).phase).toBe('connecting');f.connection('connected');expect(f.states.at(-1).phase).toBe('connected');f.session.dispose();
});
test('callee loads current call, applies offer and returns immutable answer',async()=>{
 const f=fixture('doctor');await f.session.load();await f.session.accept();await drain();
 expect(f.api.get).toHaveBeenCalledWith({consultationId:room});
 expect(f.peer.remote.mock.invocationCallOrder[0]).toBeLessThan(f.peer.answer.mock.invocationCallOrder[0]);
 expect(f.api.description).toHaveBeenCalledWith(expect.anything(),'offer');
 expect(f.api.respond.mock.calls[0][0]).toMatchObject({action:'accept',answer:{type:'answer'}});
 expect(f.api.ice.mock.calls[0][1]).toBe('patient');f.session.dispose();
});
test('duplicate metadata and remote candidates apply answer/candidate only once',async()=>{
 const f=fixture();await f.session.start('audio');f.next(accepted());f.next(accepted());await drain();
 const item={...candidate(),id:'c'.repeat(64),sequence:1};f.ice([item,item]);f.ice([item]);await drain();
 expect(f.peer.remote).toHaveBeenCalledTimes(1);expect(f.peer.candidate).toHaveBeenCalledTimes(1);f.session.dispose();
});
test('remote candidates wait for remote description to finish',async()=>{
 const f=fixture(),d=deferred();await f.session.start('audio');f.peer.remote.mockReturnValue(d.promise);f.next(accepted());await drain();
 expect(f.api.ice).not.toHaveBeenCalled();d.resolve();await drain();expect(f.api.ice).toHaveBeenCalledTimes(1);f.session.dispose();
});
test('duplicate local candidates/end markers ignored and batches limited to 32, spaced',async()=>{
 const f=fixture();await f.session.start('audio');for(let i=0;i<40;i++) f.event(candidate(i));f.event(candidate(0));f.event(null);
 f.next(accepted());await drain();expect(f.api.publish.mock.calls[0][0].candidates).toHaveLength(32);
 await jest.advanceTimersByTimeAsync(1099);expect(f.api.publish).toHaveBeenCalledTimes(1);
 await jest.advanceTimersByTimeAsync(1);expect(f.api.publish.mock.calls[1][0].candidates).toHaveLength(8);f.session.dispose();
});
test('uncertain start retries preserve exactly the same UUID and SDP',async()=>{
 const f=fixture();f.api.start.mockRejectedValueOnce({code:'functions/unavailable'});const p=f.session.start('audio');await drain();await jest.advanceTimersByTimeAsync(1100);await p;
 expect(f.api.start.mock.calls[1][0]).toEqual(f.api.start.mock.calls[0][0]);expect(f.peer.offer).toHaveBeenCalledTimes(1);f.session.dispose();
});
test('rate-limited ICE retries preserve batch and UUID',async()=>{
 const f=fixture();f.api.publish.mockRejectedValueOnce({code:'functions/resource-exhausted'});await f.session.start('audio');f.event(candidate());f.next(accepted());await drain();
 await jest.advanceTimersByTimeAsync(1100);expect(f.api.publish.mock.calls[1][0]).toEqual(f.api.publish.mock.calls[0][0]);f.session.dispose();
});
test('terminal replay cannot revive media or publish buffered ICE',async()=>{
 const f=fixture();f.api.start.mockResolvedValue({call:ended(),replayed:true});await f.session.start('audio');
 expect(f.states.at(-1).phase).toBe('ended');expect(f.peer.close).toHaveBeenCalledTimes(1);expect(f.api.watch).not.toHaveBeenCalled();
});
test('dispose clears observable state and ignores a late start response',async()=>{
 const f=fixture(),d=deferred();f.api.start.mockReturnValue(d.promise);const p=f.session.start('audio');await drain();f.session.dispose();
 d.resolve({call:ringing(),replayed:false});await p;expect(f.states.at(-1)).toEqual({phase:'disposed',call:null,error:null});expect(f.api.watch).not.toHaveBeenCalled();
});
test('dispose during remote SDP prevents listeners and remote candidate application',async()=>{
 const f=fixture(),d=deferred();await f.session.start('audio');f.peer.remote.mockReturnValue(d.promise);f.next(accepted());await drain();f.session.dispose();d.resolve();await drain();
 expect(f.api.ice).not.toHaveBeenCalled();expect(f.stop).toHaveBeenCalledTimes(1);expect(f.states.at(-1).call).toBeNull();
});
test('expired ringing stops locally and triggers best-effort server reconciliation',async()=>{
 const f=fixture();await f.session.start('audio');await jest.advanceTimersByTimeAsync(60000);expect(f.states.at(-1).phase).toBe('ended');expect(f.peer.close).toHaveBeenCalled();
});
test('listener permission denial fails closed and exposes no payload text',async()=>{
 const f=fixture();await f.session.start('audio');f.error({code:'permission-denied',message:'private SDP'});
 expect(f.states.at(-1)).toMatchObject({phase:'error',call:null,error:'permission-denied'});expect(f.peer.close).toHaveBeenCalled();
});
test('reconciliation detects a terminal appointment and tears down signaling',async()=>{
 const f=fixture();await f.session.start('audio');f.api.get.mockResolvedValue({call:ended()});await jest.advanceTimersByTimeAsync(15000);
 expect(f.states.at(-1).phase).toBe('ended');expect(f.stop).toHaveBeenCalled();
});
test('wrong participant data fails closed before attaching listeners',async()=>{
 const f=fixture('stranger');await f.session.load();expect(f.states.at(-1).phase).toBe('error');expect(f.api.watch).not.toHaveBeenCalled();
});
test('accepted calls cannot be resumed without their native session',async()=>{
 const f=fixture();f.api.get.mockResolvedValue({call:accepted()});await f.session.load();expect(f.states.at(-1).error).toBe('session-resume-unsupported');
});
test('recipient rejects ringing; initiator cancels via end; local resources close first',async()=>{
 const f=fixture();await f.session.start('audio');await f.session.end();expect(f.api.end).toHaveBeenCalledTimes(1);expect(f.peer.close).toHaveBeenCalledTimes(1);
 const g=fixture('doctor');await g.session.load();await g.session.end();expect(g.api.respond.mock.calls[0][0].action).toBe('reject');
});
test('end retry preserves UUID and disposal ignores its late response',async()=>{
 const f=fixture(),d=deferred();await f.session.start('audio');f.api.end.mockRejectedValueOnce({code:'unavailable'}).mockReturnValueOnce(d.promise);
 const p=f.session.end();await drain();await jest.advanceTimersByTimeAsync(1100);expect(f.api.end.mock.calls[1][0]).toEqual(f.api.end.mock.calls[0][0]);
 f.session.dispose();d.resolve({call:ended(),replayed:false});await p;expect(f.states.at(-1).phase).toBe('disposed');
});
test('disconnected peer closes rather than silently renegotiating immutable SDP',async()=>{
 const f=fixture();await f.session.start('audio');f.connection('disconnected');expect(f.states.at(-1).error).toBe('connection-lost');
});
test('local candidate quota fails closed and hung startup has a timeout',async()=>{
 const f=fixture();await f.session.start('audio');for(let i=0;i<129;i++)f.event(candidate(i));expect(f.states.at(-1).error).toBe('resource-exhausted');
 const g=fixture();g.api.start.mockReturnValue(new Promise(()=>{}));g.session.start('audio');await jest.advanceTimersByTimeAsync(30000);expect(g.states.at(-1).error).toBe('deadline-exceeded');
});
test('late accept after disposal cannot restore call state or start ICE',async()=>{
 const f=fixture('doctor'),d=deferred();await f.session.load();f.api.respond.mockReturnValue(d.promise);
 const p=f.session.accept();await drain();f.session.dispose();d.resolve({call:accepted(),replayed:false});await p;
 expect(f.states.at(-1)).toMatchObject({phase:'disposed',call:null});expect(f.api.ice).not.toHaveBeenCalled();
});
test('double accept cannot create a second answer while metadata repeats',async()=>{
 const f=fixture('doctor'),d=deferred();await f.session.load();f.peer.answer.mockReturnValue(d.promise);
 const p=f.session.accept();await drain();f.next(ringing());await f.session.accept();expect(f.peer.answer).toHaveBeenCalledTimes(1);
 d.resolve({type:'answer',sdp:'v=0\r\nsynthetic'});await p;f.session.dispose();
});
test('transport retry budget is bounded and failure closes the peer',async()=>{
 const f=fixture();f.api.start.mockRejectedValue({code:'functions/unavailable'});const p=f.session.start('audio');
 await drain();await jest.advanceTimersByTimeAsync(3300);await p;
 expect(f.api.start).toHaveBeenCalledTimes(3);expect(f.states.at(-1)).toMatchObject({phase:'error',error:'unavailable',call:null});expect(f.peer.close).toHaveBeenCalledTimes(1);
});
test('changed participant binding and old snapshot after terminal state cannot revive session',async()=>{
 const f=fixture();await f.session.start('audio');f.next({...ringing(),doctorId:'other',recipientId:'other'});expect(f.states.at(-1).phase).toBe('error');
 f.next(accepted());await drain();expect(f.api.ice).not.toHaveBeenCalled();
});
