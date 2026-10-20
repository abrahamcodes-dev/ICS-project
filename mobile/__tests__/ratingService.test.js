const mockCall=jest.fn(),mockAuth={currentUser:{uid:'p'}};let mockIdentity;
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn(()=>mockCall)}));
jest.mock('../src/services/firebaseConfig',()=>({auth:mockAuth,functions:{local:true}}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
const {createRatingSession,validateRatingInput}=require('../src/services/ratingService');
const {httpsCallable}=require('firebase/functions'),cid='a'.repeat(64);
const rating={consultationId:cid,score:0,comment:'',createdAt:123};
beforeEach(()=>{jest.clearAllMocks();mockCall.mockReset();mockAuth.currentUser={uid:'p'};});
test('zero, empty comment and connected callable; response strips unrelated fields',async()=>{
 const s=createRatingSession('p');mockCall.mockResolvedValue({data:{rating:{...rating,patientId:'private'},replayed:false}});
 expect(await s.submit(cid,0,'')).toEqual(rating);
 expect(httpsCallable).toHaveBeenCalledWith({local:true},'rateDoctor');
 expect(mockCall).toHaveBeenCalledWith({consultationId:cid,score:0,comment:''});s.dispose();
});
test('uncertain retry freezes intent and duplicates share request',async()=>{
 const s=createRatingSession('p');mockCall.mockRejectedValueOnce(Error('offline'));await expect(s.submit(cid,0,'')).rejects.toThrow();
 expect(()=>s.submit(cid,1,'')).toThrow('unchanged');
 mockCall.mockResolvedValue({data:{rating,replayed:true}});const a=s.submit(cid,0,''),b=s.submit(cid,0,'');expect(a).toBe(b);
 await a;expect(mockCall).toHaveBeenCalledTimes(2);expect(mockCall.mock.calls[0][0]).toEqual(mockCall.mock.calls[1][0]);s.dispose();
});
test.each(['dispose','identity','account'])('late results rejected after %s',async kind=>{
 let resolve;const s=createRatingSession('p');mockCall.mockReturnValue(new Promise(r=>{resolve=r;}));const result=s.get(cid);
 if(kind==='dispose')s.dispose();if(kind==='identity')mockIdentity();if(kind==='account')mockAuth.currentUser={uid:'other'};
 resolve({data:{rating}});await expect(result).rejects.toThrow('Session changed');s.dispose();
});
test('mismatched consultation and invalid aggregates rejected',async()=>{
 const s=createRatingSession('p');mockCall.mockResolvedValue({data:{rating:{...rating,consultationId:'b'.repeat(64)}}});
 await expect(s.get(cid)).rejects.toThrow();
 for(const data of [{count:0,average:0},{count:1,average:6},{count:-1,average:null}]){
  mockCall.mockResolvedValue({data});await expect(s.summary()).rejects.toThrow();
 }
 mockCall.mockResolvedValue({data:{count:0,average:null}});expect(await s.summary()).toEqual({count:0,average:null});
 expect(mockCall).toHaveBeenLastCalledWith({});s.dispose();
});
test('integer score and comment limits',()=>{
 expect(validateRatingInput(0,'')).toEqual({score:0,comment:''});
 for(const n of [-1,6,0.5])expect(()=>validateRatingInput(n,'')).toThrow();
 expect(()=>validateRatingInput(5,'x'.repeat(1001))).toThrow();
});
