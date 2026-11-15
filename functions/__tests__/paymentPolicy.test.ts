import {amountMinor,testPhone,assertTransition,requireSimulationEnvironment} from '../src/payments/policy';
test.each([0,100,150,10000000])('integer minor fee %s supported',n=>expect(amountMinor(n)).toBe(n));
test.each([-1,1,99,10000001,1.5,NaN,Infinity,'100',null])('invalid fee %s rejected',n=>expect(()=>amountMinor(n)).toThrow());
test.each(['0712345678','+254712345678','254712345678','0 712 345 678'])('Kenyan test phone %s normalized',v=>expect(testPhone(v)).toBe('254712345678'));
test('new 01 numbering supported without sending a real message',()=>expect(testPhone('0112345678')).toBe('254112345678'));
test.each(['+15550000000','07123','254912345678','07123456789','0712345678;PIN=1234'])('invalid phone rejected %s',v=>expect(()=>testPhone(v)).toThrow());
test.each([['created','pending'],['pending','succeeded'],['expired','refund_pending'],['cancelled','refund_pending'],['refund_pending','refund_failed'],['refund_failed','refund_pending'],['refund_pending','refunded']])('transition %s to %s', (a,b)=>expect(()=>assertTransition(a as any,b as any)).not.toThrow());
test.each([['failed','succeeded'],['refunded','succeeded'],['pending','refunded'],['succeeded','created']])('forged transition %s to %s rejected',(a,b)=>expect(()=>assertTransition(a as any,b as any)).toThrow());
test.each([{}, {FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'live-calladoc',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}, {FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-calladoc',FIRESTORE_EMULATOR_HOST:'production.example:443'},{GCLOUD_PROJECT:'demo-calladoc',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}])('simulation fails closed outside exact local runtime %#',env=>expect(()=>requireSimulationEnvironment(env)).toThrow());
test('explicit local runtime accepted',()=>expect(()=>requireSimulationEnvironment({FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-calladoc',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'})).not.toThrow());

const academic={PAYMENT_SIMULATION_MODE:'academic-demo',PAYMENT_SIMULATION_PROJECT_ID:'calladoc-academic-demo',GCLOUD_PROJECT:'calladoc-academic-demo'};
test('dedicated hosted academic demo requires explicit server configuration',()=>expect(()=>requireSimulationEnvironment(academic)).not.toThrow());
test.each([
 {...academic,PAYMENT_SIMULATION_MODE:undefined},
 {...academic,PAYMENT_SIMULATION_PROJECT_ID:'calladoc-production',GCLOUD_PROJECT:'calladoc-production'},
 {...academic,GCLOUD_PROJECT:'calladoc-production'},
 {...academic,FIRESTORE_EMULATOR_HOST:'other:8080'},
 {...academic,FUNCTIONS_EMULATOR:'true'},
 {...academic,FIREBASE_AUTH_EMULATOR_HOST:'other:9099'},
])('hosted simulation fails closed for mismatched or mixed runtime %#',env=>expect(()=>requireSimulationEnvironment(env)).toThrow());
