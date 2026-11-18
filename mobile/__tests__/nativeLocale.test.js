jest.mock('expo',()=>({requireOptionalNativeModule:jest.fn()}));
const {Platform}=require('react-native');
const {requireOptionalNativeModule}=require('expo');
const {syncNativeLanguage}=require('../src/i18n/nativeLocale');
const locale=require('../src/i18n/locale');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const adapter=(saved=null)=>({getItem:jest.fn(async()=>saved),setItem:jest.fn(async()=>{})});
let originalOS;
beforeEach(async()=>{
 originalOS=Platform.OS;Platform.OS='android';jest.clearAllMocks();
 await locale.initializeLanguage(adapter());await locale.setLanguage('en');await flush();
});
afterEach(async()=>{Platform.OS=originalOS;await locale.initializeLanguage(adapter());await locale.setLanguage('en');await flush();});

test('waits for stored preference before requesting native startup locale',async()=>{
 let resolve;const sync=jest.fn(async()=>{});
 const loading=locale.initializeLanguage({...adapter(),getItem:()=>new Promise(r=>resolve=r)},sync);
 await flush();expect(sync).not.toHaveBeenCalled();resolve('sw');await loading;await flush();
 expect(sync).toHaveBeenCalledTimes(1);expect(sync).toHaveBeenCalledWith('sw');
});
test('default preference syncs English after storage resolves',async()=>{
 const sync=jest.fn(async()=>{});await locale.initializeLanguage(adapter(),sync);await flush();
 expect(sync).toHaveBeenCalledWith('en');
});
test('startup does not wait for a native request that has not settled',async()=>{
 let finish;const sync=jest.fn(()=>new Promise(resolve=>finish=resolve));
 await locale.initializeLanguage(adapter('sw'),sync);await flush();
 expect(locale.getLanguage()).toBe('sw');expect(sync).toHaveBeenCalledWith('sw');
 finish();await flush();
});
test('switches both directions, persists before native update and skips redundant selections',async()=>{
 const store=adapter(),events=[];store.setItem=async(k,v)=>events.push('stored:'+v);
 const sync=jest.fn(async v=>events.push('native:'+v));
 await locale.initializeLanguage(store,sync);await flush();events.length=0;sync.mockClear();
 await locale.setLanguage('sw');await locale.setLanguage('sw');await locale.setLanguage('en');
 expect(sync.mock.calls).toEqual([['sw'],['en']]);
 expect(events.indexOf('stored:sw')).toBeLessThan(events.indexOf('native:sw'));
});
test('selection during startup wins over stale stored language',async()=>{
 let resolve;const sync=jest.fn(async()=>{});
 const loading=locale.initializeLanguage({...adapter(),getItem:()=>new Promise(r=>resolve=r)},sync);
 await locale.setLanguage('sw');expect(sync).not.toHaveBeenCalled();resolve('en');await loading;await flush();
 expect(locale.getLanguage()).toBe('sw');expect(sync.mock.calls).toEqual([['sw']]);
});
test('rapid selections do not apply stale native locales',async()=>{
 const sync=jest.fn(async()=>{});await locale.initializeLanguage(adapter(),sync);await flush();sync.mockClear();
 await Promise.all([locale.setLanguage('sw'),locale.setLanguage('en'),locale.setLanguage('sw')]);
 expect(sync.mock.calls).toEqual([['sw']]);
});
test('failed native synchronization does not reject selection and retries later',async()=>{
 const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try {
 const sync=jest.fn().mockRejectedValueOnce(Error('unavailable')).mockResolvedValue(undefined);
 await locale.initializeLanguage(adapter('sw'),sync);await flush();
 expect(locale.getLanguage()).toBe('sw');await expect(locale.setLanguage('sw')).resolves.toBeUndefined();
 expect(sync).toHaveBeenCalledTimes(2);expect(warning).toHaveBeenCalled();
 } finally {warning.mockRestore();}
});
test('storage read failure never requests native changes',async()=>{
 const sync=jest.fn();await expect(locale.initializeLanguage({...adapter(),getItem:async()=>{throw Error('disk');}},sync)).rejects.toThrow('disk');
 await locale.setLanguage('sw');expect(sync).not.toHaveBeenCalled();
});
test('storage write failure does not apply an unpersisted native locale',async()=>{
 const store=adapter(),sync=jest.fn(async()=>{});await locale.initializeLanguage(store,sync);await flush();sync.mockClear();
 store.setItem=async()=>{throw Error('disk');};await expect(locale.setLanguage('sw')).rejects.toThrow('disk');expect(sync).not.toHaveBeenCalled();
});
test('unsupported input is rejected without storage or native calls',async()=>{
 const store=adapter(),sync=jest.fn();await locale.initializeLanguage(store,sync);await flush();sync.mockClear();
 await expect(locale.setLanguage('fr')).rejects.toThrow('Unsupported');expect(store.setItem).not.toHaveBeenCalled();expect(sync).not.toHaveBeenCalled();
 await expect(syncNativeLanguage('fr')).rejects.toThrow('Unsupported');
});
test('Android uses optional module and propagates native errors to the safe lifecycle boundary',async()=>{
 const setLanguage=jest.fn(async()=>{});requireOptionalNativeModule.mockReturnValue({setLanguage});
 await syncNativeLanguage('sw');expect(setLanguage).toHaveBeenCalledWith('sw');
 requireOptionalNativeModule.mockReturnValue(null);await expect(syncNativeLanguage('en')).rejects.toThrow('unavailable');
});
test('iOS/web do not require an Android module',async()=>{
 Platform.OS='ios';await syncNativeLanguage('sw');Platform.OS='web';await syncNativeLanguage('en');
 expect(requireOptionalNativeModule).not.toHaveBeenCalled();
});

test.each([true,false,undefined])('native change acknowledgement %s is strict and backward-compatible',async(result)=>{
 requireOptionalNativeModule.mockReturnValue({setLanguage:async()=>result});
 expect(await syncNativeLanguage('sw')).toBe(result===true);
});

test.each([false,'failure','missing'])('native %s cannot leave a restoration bookmark',async(result)=>{
 const handoff=require('../src/navigation/localeRestoration');
 const identity={status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active',verificationStatus:'approved'}};
 const sync=jest.fn(async()=>false),store=adapter('en');
 await locale.initializeLanguage(store,sync);await flush();
 handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),null);
 const unregister=handoff.registerDoctorTab(Symbol(),identity,'Profile',true);
 if(result==='failure')sync.mockRejectedValueOnce(Error('native'));
 else if(result==='missing')sync.mockImplementationOnce(async()=>{requireOptionalNativeModule.mockReturnValue(null);return syncNativeLanguage('sw');});
 const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try {await locale.setLanguage('sw');expect(handoff.consumeDoctorTab(Symbol(),identity)).toBeUndefined();}
 finally {unregister();warning.mockRestore();}
});

test('startup native changes never arm a bookmark or write identity/clinical storage',async()=>{
 const handoff=require('../src/navigation/localeRestoration'),store=adapter('sw');
 const identity={status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active',verificationStatus:'approved'}};
 handoff.discardLocaleRestoration();handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),null);
 const unregister=handoff.registerDoctorTab(Symbol(),identity,'Profile',true);
 try {
  await locale.initializeLanguage(store,async()=>true);await flush();
  expect(handoff.consumeDoctorTab(Symbol(),identity)).toBeUndefined();expect(store.setItem).not.toHaveBeenCalled();
 } finally {unregister();}
});
