jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:null},app:{},db:{}}));
jest.mock('../src/services/googleAuth',()=>({signInGoogleAccount:jest.fn(),cancelGoogleAuthentication:jest.fn(),clearNativeGoogleSession:jest.fn(async()=>{})}));
jest.mock('../src/services/identityService',()=>({loadOwnIdentity:jest.fn()}));
jest.mock('../src/services/notificationDevice',()=>({prepareNotificationLogout:jest.fn(async()=>{})}));
jest.mock('../src/services/patientConsent',()=>({validateConsentChoice:jest.fn(choice=>{if(!choice?.privacyAcknowledged||!choice.sharingDecision)throw Error('Consent required');}),consentRequest:jest.fn(()=>({privacyAcknowledged:true}))}));
jest.mock('firebase/auth',()=>({signOut:jest.fn(async auth=>{auth.currentUser=null;})}));
jest.mock('firebase/functions',()=>({getFunctions:()=>({}),httpsCallable:jest.fn()}));
const {auth}=require('../src/services/firebaseConfig'),google=require('../src/services/googleAuth'),{loadOwnIdentity}=require('../src/services/identityService'),{httpsCallable}=require('firebase/functions');
const service=require('../src/services/authService'),complete=jest.fn();
const choice={privacyAcknowledged:true,sharingDecision:'declined'};
const identity={uid:'google-user',email:'synthetic@example.test',fullName:'Synthetic Patient',role:'patient',status:'active',schemaVersion:1,createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z'};
beforeEach(async()=>{await service.logoutUser();jest.clearAllMocks();google.signInGoogleAccount.mockImplementation(async()=>{auth.currentUser={uid:'google-user'};return auth.currentUser;});loadOwnIdentity.mockReset().mockResolvedValue(identity);httpsCallable.mockReturnValue(complete);complete.mockReset().mockResolvedValue({data:identity});});
test.each(['patient','doctor'])('Google %s uses canonical registration and preserves pending doctor verification',async role=>{
 const expected={...identity,role,...(role==='doctor'?{verificationStatus:'pending'}:{})};loadOwnIdentity.mockResolvedValueOnce(null).mockResolvedValue(expected);complete.mockResolvedValue({data:expected});
 expect(await service.registerGoogleUser('Synthetic Patient',role,role==='patient'?choice:undefined)).toEqual(expected);
 expect(complete).toHaveBeenCalledWith(expect.objectContaining({role,fullName:'Synthetic Patient'}));expect(service.isRegistrationOpen()).toBe(false);
});
test.each([undefined,{privacyAcknowledged:false,sharingDecision:'declined'},{privacyAcknowledged:true,sharingDecision:null}])('patient consent is required before any Google prompt %#',async consent=>{
 await expect(service.registerGoogleUser('Synthetic Patient','patient',consent)).rejects.toThrow();expect(google.signInGoogleAccount).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();
});
test('existing Google doctor preserves canonical role/approval regardless of selected registration role',async()=>{
 const doctor={...identity,role:'doctor',verificationStatus:'approved'};loadOwnIdentity.mockResolvedValue(doctor);
 expect(await service.registerGoogleUser('Ignored new name','patient',choice)).toEqual(doctor);expect(complete).not.toHaveBeenCalled();
});
test('cancelled registration releases navigation gate and never creates canonical data',async()=>{
 google.signInGoogleAccount.mockResolvedValueOnce(null);expect(await service.registerGoogleUser('Synthetic Patient','patient',choice)).toBeNull();expect(service.isRegistrationOpen()).toBe(false);expect(complete).not.toHaveBeenCalled();
});
test('uncertain canonical registration retries the same authenticated UID without creating another account',async()=>{
 loadOwnIdentity.mockResolvedValueOnce(null);complete.mockRejectedValueOnce(Error('offline'));
 await expect(service.registerGoogleUser('Synthetic Patient','patient',choice)).rejects.toMatchObject({code:'registration-incomplete'});expect(service.isRegistrationOpen()).toBe(true);
 loadOwnIdentity.mockResolvedValueOnce(null).mockResolvedValue(identity);await service.registerGoogleUser('Synthetic Patient','patient',choice);
 expect(google.signInGoogleAccount).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(2);expect(service.isRegistrationOpen()).toBe(false);
});
test('an existing unrelated session cannot be used as a Google registration retry',async()=>{
 auth.currentUser={uid:'other'};await expect(service.registerGoogleUser('Synthetic Patient','patient',choice)).rejects.toThrow('Already signed in');expect(google.signInGoogleAccount).not.toHaveBeenCalled();
});
test('logout clears native Google state and Firebase session',async()=>{
 auth.currentUser={uid:'google-user'};await service.logoutUser();expect(google.clearNativeGoogleSession).toHaveBeenCalledTimes(1);expect(auth.currentUser).toBeNull();
});
