jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:{uid:'patient'}},functions:{}}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
const {auth}=require('../src/services/firebaseConfig'),{httpsCallable}=require('firebase/functions'),service=require('../src/services/payments');
beforeEach(()=>{jest.clearAllMocks();auth.currentUser={uid:'patient'};});
test.each([['0',0],['1',100],['1.5',150],['1500.25',150025],['100000',10000000]])('decimal fee %s parsed to integer %s',(input,minor)=>expect(service.parseKsh(input)).toBe(minor));
test.each(['-1','0.01','1.005','1e3','100001','NaN','1,000'])('invalid fee %s rejected',s=>expect(()=>service.parseKsh(s)).toThrow());
test('minor currency is rendered exactly',()=>expect(service.formatKsh(150025)).toBe('KSh 1,500.25'));
test('normalizes test phone and rejects PIN-like input',()=>{expect(service.normalizeTestPhone('+254 712 345 678')).toBe('254712345678');expect(()=>service.normalizeTestPhone('0712345678 PIN 1234')).toThrow();});
test('checkout sends intent and fee revision, never a trusted amount or success outcome',async()=>{const call=jest.fn().mockResolvedValue({data:{kind:'payment'}});httpsCallable.mockReturnValue(call);const s=service.createPaymentSession('patient'),input={doctorId:'doctor',startAt:1,requestId:'stable',expectedFeeRevision:2,phone:'254700000000'};await s.checkout(input);await s.checkout(input);expect(call.mock.calls).toEqual([[input],[input]]);expect(httpsCallable).toHaveBeenCalledWith(expect.anything(),'createConsultationCheckout');});
test('switching accounts discards a pending response and disposed sessions cannot send',async()=>{httpsCallable.mockReturnValue(async()=>{auth.currentUser={uid:'other'};return {data:{payments:[]}};});const s=service.createPaymentSession('patient');await expect(s.history()).rejects.toThrow('Payment session ended');s.dispose();await expect(s.status('x')).rejects.toThrow('Payment session ended');});
test('errors never suggest retrying with a new intent after uncertain response',()=>{expect(service.paymentError(Error('provider secret'))).toContain('Refresh this request');expect(service.paymentError(Error('provider secret'))).not.toContain('secret');});

test.each(['approve','decline'])('simulator %s sends only payment identity and decision',async decision=>{
 const payment={status:'pending'},call=jest.fn().mockResolvedValue({data:{payment}});httpsCallable.mockReturnValue(call);
 expect(await service.createPaymentSession('patient').decide('a'.repeat(64),decision)).toEqual(payment);
 expect(httpsCallable).toHaveBeenCalledWith(expect.anything(),'submitSimulatedPaymentDecision');
 expect(call).toHaveBeenCalledWith({paymentId:'a'.repeat(64),decision});
});
