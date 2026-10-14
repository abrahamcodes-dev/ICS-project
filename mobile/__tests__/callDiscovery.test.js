jest.mock('../src/services/calls/signaling',()=>({callSignaling:{}}));
const {discoverConsultationCalls}=require('../src/services/calls/discovery');
beforeEach(()=>jest.useFakeTimers());afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
test('known-consultation discovery is serial and polls every five seconds',async()=>{
 let resolve;const get=jest.fn(()=>new Promise(r=>resolve=r)),next=jest.fn(),error=jest.fn();const stop=discoverConsultationCalls('room',next,error,{get});
 await jest.advanceTimersByTimeAsync(20000);expect(get).toHaveBeenCalledTimes(1);expect(get).toHaveBeenCalledWith({consultationId:'room'});
 resolve({call:{callId:'synthetic'}});await Promise.resolve();expect(next).toHaveBeenCalledWith({callId:'synthetic'});
 await jest.advanceTimersByTimeAsync(4999);expect(get).toHaveBeenCalledTimes(1);await jest.advanceTimersByTimeAsync(1);expect(get).toHaveBeenCalledTimes(2);stop();
});
test('unmount suppresses a late discovery response and future polls',async()=>{
 let resolve;const get=jest.fn(()=>new Promise(r=>resolve=r)),next=jest.fn();const stop=discoverConsultationCalls('room',next,jest.fn(),{get});stop();resolve({call:{}});
 await jest.advanceTimersByTimeAsync(10000);expect(next).not.toHaveBeenCalled();expect(get).toHaveBeenCalledTimes(1);
});
test('authorization/network failure stops polling and reports no private error text',async()=>{
 const error=jest.fn(),get=jest.fn(async()=>{throw new Error('private');});discoverConsultationCalls('room',jest.fn(),error,{get});await jest.advanceTimersByTimeAsync(20000);
 expect(error).toHaveBeenCalledWith();expect(get).toHaveBeenCalledTimes(1);
});
