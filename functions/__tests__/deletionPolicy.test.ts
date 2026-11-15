import {requireRecentAuthentication,assertNoCareCommitment} from '../src/accounts/deletionPolicy';
const now=Date.parse('2026-11-03T12:00:00Z');
test.each([undefined,null,'1',NaN,Infinity,now/1000-301,now/1000+31])('rejects stale or invalid auth_time %p',value=>{expect(()=>requireRecentAuthentication(value,now)).toThrow();});
test.each([now/1000,now/1000-300,now/1000+10])('accepts recent authenticated sign-in %p',value=>{expect(()=>requireRecentAuthentication(value,now)).not.toThrow();});
test('future, live and grace-window care blocks deletion; expired history does not',()=>{
 for(const end of [now+3600000,now,now-899999])expect(()=>assertNoCareCommitment({endAt:{toMillis:()=>end}},now)).toThrow(/Resolve/);
 expect(()=>assertNoCareCommitment({endAt:{toMillis:()=>now-900000}},now)).not.toThrow();
 expect(()=>assertNoCareCommitment(null,now)).not.toThrow();
});
