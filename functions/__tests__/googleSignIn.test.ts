import {createGoogleSignInHandler,type GoogleAccount,type GoogleIdentity} from '../src/auth/googleSignInHandler';
const identity:GoogleIdentity={sub:'google-subject',email:'synthetic@example.test',emailVerified:true,name:'Synthetic Google'};
const request={data:{idToken:'synthetic-google-token-for-unit-test',allowCreate:true}};
function fixture(){
 const users=new Map<string,GoogleAccount>();
 const deps={
  verify:jest.fn(async()=>identity),byGoogle:jest.fn(async(sub:string)=>[...users.values()].find(u=>u.providerData.some(p=>p.providerId==='google.com'&&p.uid===sub))??null),
  byEmail:jest.fn(async(email:string)=>[...users.values()].find(u=>u.email===email)??null),get:jest.fn(async(uid:string)=>users.get(uid)!),
  create:jest.fn(async(input:{uid:string;email:string})=>{if([...users.values()].some(u=>u.email===input.email))throw {code:'auth/email-already-exists'};const user={...input,disabled:false,providerData:[]};users.set(input.uid,user);return user;}),
  link:jest.fn(async(uid:string,g:GoogleIdentity)=>{users.get(uid)!.providerData=[{providerId:'google.com',uid:g.sub}];}),
  available:jest.fn(async()=>true),mint:jest.fn(async()=> 'synthetic-custom-token'),
 };
 return {users,deps,handler:createGoogleSignInHandler(deps)};
}
test('new verified Google identity gets a bound UID, no canonical profile or role claims',async()=>{
 const {handler,deps}=fixture();const result=await handler(request);
 expect(result.uid).toMatch(/^g_[a-f0-9]{32}_[a-f0-9]{32}$/);expect(deps.link).toHaveBeenCalledWith(result.uid,identity);
 expect(deps.mint).toHaveBeenCalledWith(result.uid);expect(deps.create).toHaveBeenCalledWith(expect.objectContaining({emailVerified:true,email:identity.email}));
});
test('login never creates an account or guesses its role',async()=>{
 const {handler,deps}=fixture();await expect(handler({data:{...request.data,allowCreate:false}})).rejects.toMatchObject({details:{reason:'google_registration_required'}});
 expect(deps.create).not.toHaveBeenCalled();expect(deps.mint).not.toHaveBeenCalled();
});
test('existing provider binding preserves UID, profile and permissions on replay',async()=>{
 const {handler,deps,users}=fixture();users.set('existing',{uid:'existing',email:'old-address@example.test',disabled:false,providerData:[{providerId:'google.com',uid:identity.sub}]});
 for(let i=0;i<2;i++)expect((await handler({data:{...request.data,allowCreate:false}})).uid).toBe('existing');
 expect(deps.create).not.toHaveBeenCalled();expect(deps.link).not.toHaveBeenCalled();
});
test.each(['password','google.com'])('email collision with %s is never automatically merged',async provider=>{
 const {handler,deps,users}=fixture();users.set('original',{uid:'original',email:identity.email,disabled:false,providerData:[{providerId:provider,uid:'different-subject'}]});
 await expect(handler(request)).rejects.toMatchObject({details:{reason:'google_link_required'}});
 expect(deps.link).not.toHaveBeenCalled();expect(deps.mint).not.toHaveBeenCalled();expect(users.size).toBe(1);
});
test('interrupted binding is recoverable only for the same verified Google subject',async()=>{
 const {handler,deps,users}=fixture();deps.link.mockRejectedValueOnce(Error('transient'));
 await expect(handler(request)).rejects.toMatchObject({code:'unavailable'});const original=[...users.keys()][0];
 expect((await handler(request)).uid).toBe(original);expect(users.size).toBe(1);
});
test('recycled Google email cannot recover a different subject’s provisional account',async()=>{
 const {handler,deps}=fixture();deps.link.mockRejectedValueOnce(Error('transient'));await expect(handler(request)).rejects.toBeDefined();
 deps.verify.mockResolvedValue({...identity,sub:'another-google-subject'});
 await expect(handler(request)).rejects.toMatchObject({details:{reason:'google_link_required'}});expect(deps.mint).not.toHaveBeenCalled();
});
test.each(['disabled','deletion'])('a %s account cannot receive a new session',async reason=>{
 const {handler,deps,users}=fixture();users.set('existing',{uid:'existing',email:identity.email,disabled:reason==='disabled',providerData:[{providerId:'google.com',uid:identity.sub}]});
 if(reason==='deletion')deps.available.mockResolvedValue(false);
 await expect(handler(request)).rejects.toMatchObject({code:'permission-denied'});expect(deps.mint).not.toHaveBeenCalled();
});
test('unconfirmed binding never mints a token',async()=>{
 const {handler,deps}=fixture();deps.link.mockImplementation(async()=>{});
 await expect(handler(request)).rejects.toMatchObject({code:'unavailable'});expect(deps.mint).not.toHaveBeenCalled();
});
test('custom-token exchange cannot bypass an existing Firebase MFA requirement',async()=>{
 const {handler,deps,users}=fixture();users.set('existing',{uid:'existing',disabled:false,providerData:[{providerId:'google.com',uid:identity.sub}],multiFactor:{enrolledFactors:[{factorId:'phone'}]}});
 await expect(handler(request)).rejects.toMatchObject({details:{reason:'google_mfa_required'}});expect(deps.mint).not.toHaveBeenCalled();
});
test('parallel provisioning converges to one UID and never overwrites an email account',async()=>{
 const {handler,users}=fixture();const results=await Promise.all([handler(request),handler(request)]);
 expect(results[0].uid).toBe(results[1].uid);expect(users.size).toBe(1);
});
test.each([null,{},[],{idToken:'short',allowCreate:true},{...request.data,uid:'victim'},{...request.data,role:'administrator'},{idToken:request.data.idToken}])('rejects malformed or authority-bearing input %#',async data=>{
 const {handler,deps}=fixture();await expect(handler({data})).rejects.toMatchObject({code:'invalid-argument'});expect(deps.verify).not.toHaveBeenCalled();
});
test('authenticated calls cannot switch accounts through the exchange',async()=>{
 const {handler,deps}=fixture();await expect(handler({...request,auth:{uid:'victim'}})).rejects.toMatchObject({code:'failed-precondition'});expect(deps.verify).not.toHaveBeenCalled();
});
test.each([false,true])('unverified/forged Google credentials cannot authenticate (%s)',async forged=>{
 const {handler,deps}=fixture();if(forged)deps.verify.mockRejectedValue(Error('private credential'));else deps.verify.mockResolvedValue({...identity,emailVerified:false});
 await expect(handler(request)).rejects.toMatchObject({code:'unauthenticated'});expect(deps.create).not.toHaveBeenCalled();expect(deps.mint).not.toHaveBeenCalled();
});
