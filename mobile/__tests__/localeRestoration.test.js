const handoff=require('../src/navigation/localeRestoration');
const doctor=(uid='d')=>({status:'ready',firebaseUid:uid,user:{role:'doctor',status:'active',verificationStatus:'approved'}});
let oldOwner,newOwner,unregister;
function arm(){const generation=handoff.beginLocaleSelection();handoff.prepareLocaleRestoration(generation);return generation;}
function readyLinks(url=null){handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),url);}
beforeEach(()=>{
 jest.useFakeTimers();oldOwner=Symbol('old');newOwner=Symbol('new');
 handoff.discardLocaleRestoration();readyLinks();
 unregister=handoff.registerDoctorTab(oldOwner,doctor(),'Profile',true);
});
afterEach(()=>{unregister();handoff.discardLocaleRestoration();jest.useRealTimers();});
test('only a confirmed explicit change restores once, and never in the old surface',()=>{
 const generation=arm();expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
 handoff.finishLocaleRestoration(generation,true);
 expect(handoff.consumeDoctorTab(oldOwner,doctor())).toBeUndefined();
 unregister(); // Activity destroys the surface; module memory survives.
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBe('Profile');
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
});
test('ordinary mounts have no bookmark',()=>{expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();});
test.each([
 ['wrong UID',doctor('other')],
 ['patient',{...doctor(),user:{role:'patient',status:'active'}}],
 ['administrator',{...doctor(),user:{role:'administrator',status:'active'}}],
 ['disabled',{...doctor(),user:{...doctor().user,status:'disabled'}}],
 ['pending',{...doctor(),user:{...doctor().user,verificationStatus:'pending'}}],
 ['rejected',{...doctor(),user:{...doctor().user,verificationStatus:'rejected'}}],
 ['signed out',{status:'signedOut',firebaseUid:null,user:null}],
 ['identity error',{status:'identityError',firebaseUid:'d',user:null}],
 ['missing identity',{status:'identityMissing',firebaseUid:'d',user:null}],
])('%s invalidates rather than deferring an unauthorized bookmark',(_,identity)=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);
 expect(handoff.consumeDoctorTab(newOwner,identity)).toBeUndefined();
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('authentication loading waits without granting access or losing a valid bookmark',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);
 for(const status of ['initializing','loadingIdentity'])
  expect(handoff.consumeDoctorTab(newOwner,{status,firebaseUid:null,user:null})).toBeUndefined();
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBe('Profile');
});
test('loading a different authenticated UID discards the bookmark',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);
 handoff.validateLocaleIdentity({status:'loadingIdentity',firebaseUid:'other',user:null});
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('expired bookmark is rejected',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);jest.advanceTimersByTime(30_000);
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('clock rollback rejects rather than extending bookmark validity',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);jest.setSystemTime(Date.now()-1);
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('native no-op or failure cannot restore',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,false);
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('latest selection wins, including late completion of an earlier native request',()=>{
 const first=arm(),last=arm();handoff.finishLocaleRestoration(first,true);
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
 handoff.finishLocaleRestoration(last,true);expect(handoff.consumeDoctorTab(newOwner,doctor())).toBe('Profile');
});
test('explicit navigation cancels both existing and not-yet-prepared bookmarks',()=>{
 const generation=handoff.beginLocaleSelection();handoff.discardLocaleRestoration();
 handoff.prepareLocaleRestoration(generation);handoff.finishLocaleRestoration(generation,true);
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('initial deep link wins; restoration waits until link inspection completes',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);
 const check=handoff.beginLocaleLinkCheck();expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
 handoff.finishLocaleLinkCheck(check,'calladoc-demo://somewhere');
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
test('a null initial URL allows the authorized handoff and ignores stale URL checks',()=>{
 const generation=arm();handoff.finishLocaleRestoration(generation,true);
 const stale=handoff.beginLocaleLinkCheck(),check=handoff.beginLocaleLinkCheck();
 handoff.finishLocaleLinkCheck(stale,null);expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
 handoff.finishLocaleLinkCheck(check,null);expect(handoff.consumeDoctorTab(newOwner,doctor())).toBe('Profile');
});
test('no focused eligible workspace means no bookmark',()=>{
 unregister();const generation=arm();handoff.finishLocaleRestoration(generation,true);
 expect(handoff.consumeDoctorTab(newOwner,doctor())).toBeUndefined();
});
