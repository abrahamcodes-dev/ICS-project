jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:null},functions:{}}));
jest.mock('firebase/auth',()=>({signOut:jest.fn(async auth=>{auth.currentUser=null;}),signInWithCustomToken:jest.fn(),GoogleAuthProvider:{credential:jest.fn(token=>({providerId:'google.com',idToken:token}))},EmailAuthProvider:{credential:jest.fn((email,password)=>({email,password}))},linkWithCredential:jest.fn(),reauthenticateWithCredential:jest.fn()}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('@react-native-google-signin/google-signin',()=>({GoogleSignin:{configure:jest.fn(),hasPlayServices:jest.fn(),signOut:jest.fn(),signIn:jest.fn()}}));
const {auth}=require('../src/services/firebaseConfig'),fa=require('firebase/auth'),{httpsCallable}=require('firebase/functions');
const {GoogleSignin}=require('@react-native-google-signin/google-signin'),service=require('../src/services/googleAuth');
const exchange=jest.fn(),nativeSuccess={type:'success',data:{idToken:'synthetic-google-token',user:{email:'synthetic@example.test'}}};
function user(uid='existing'){return {uid,email:'synthetic@example.test',providerData:[{providerId:'password',uid:'synthetic@example.test'}],getIdToken:jest.fn(async()=> 'fresh-token')};}
beforeEach(()=>{
 jest.clearAllMocks();process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='synthetic-web.apps.googleusercontent.com';require('react-native').Platform.OS='android';auth.currentUser=null;
 GoogleSignin.hasPlayServices.mockResolvedValue(true);GoogleSignin.signOut.mockResolvedValue(undefined);GoogleSignin.signIn.mockResolvedValue(nativeSuccess);
 httpsCallable.mockReturnValue(exchange);exchange.mockResolvedValue({data:{uid:'google-uid',customToken:'synthetic-custom-token'}});
 fa.signInWithCustomToken.mockImplementation(async()=>{auth.currentUser=user('google-uid');return {user:auth.currentUser};});
 fa.reauthenticateWithCredential.mockImplementation(async()=>({user:auth.currentUser}));fa.linkWithCredential.mockImplementation(async()=>({user:auth.currentUser}));
});
test('interactive Google credential exchanges only with the configured Firebase callable and preserves server UID',async()=>{
 expect((await service.signInGoogleAccount(false)).uid).toBe('google-uid');
 expect(exchange).toHaveBeenCalledWith({idToken:'synthetic-google-token',allowCreate:false});
 expect(fa.signInWithCustomToken).toHaveBeenCalledWith(auth,'synthetic-custom-token');
 expect(GoogleSignin.configure).toHaveBeenCalledWith({webClientId:'synthetic-web.apps.googleusercontent.com',offlineAccess:false});
 expect(GoogleSignin.signOut).toHaveBeenCalledTimes(2);
});
test('cancellation has no Firebase account or profile side effects',async()=>{
 GoogleSignin.signIn.mockResolvedValue({type:'cancelled'});expect(await service.signInGoogleAccount(true)).toBeNull();expect(exchange).not.toHaveBeenCalled();expect(fa.signInWithCustomToken).not.toHaveBeenCalled();
});
test('revoked/unavailable Google credentials do not fall back to another account',async()=>{
 GoogleSignin.signIn.mockRejectedValue({code:'SIGN_IN_REQUIRED'});await expect(service.signInGoogleAccount(false)).rejects.toMatchObject({code:'SIGN_IN_REQUIRED'});expect(exchange).not.toHaveBeenCalled();expect(auth.currentUser).toBeNull();
});
test('a password account is reauthenticated before explicit Google linking, preserving UID',async()=>{
 const original=auth.currentUser=user();expect(await service.linkGoogleAccount('synthetic-password')).toBe(true);
 expect(fa.reauthenticateWithCredential).toHaveBeenCalledWith(original,{email:original.email,password:'synthetic-password'});
 expect(fa.linkWithCredential).toHaveBeenCalledWith(original,{providerId:'google.com',idToken:'synthetic-google-token'});
 expect(auth.currentUser.uid).toBe('existing');expect(exchange).not.toHaveBeenCalled();expect(fa.signInWithCustomToken).not.toHaveBeenCalled();expect(original.getIdToken).toHaveBeenCalledWith(true);
});
test('failed password proof prevents Google linking',async()=>{
 auth.currentUser=user();fa.reauthenticateWithCredential.mockRejectedValueOnce({code:'auth/invalid-credential'});
 await expect(service.linkGoogleAccount('wrong')).rejects.toBeDefined();expect(GoogleSignin.signIn).not.toHaveBeenCalled();expect(fa.linkWithCredential).not.toHaveBeenCalled();
});
test('linking a different Google email is rejected rather than changing the existing password account',async()=>{
 auth.currentUser=user();GoogleSignin.signIn.mockResolvedValueOnce({type:'success',data:{...nativeSuccess.data,user:{email:'other@example.test'}}});
 await expect(service.linkGoogleAccount('proof')).rejects.toMatchObject({code:'google/email-mismatch'});expect(fa.linkWithCredential).not.toHaveBeenCalled();
});
test('Google credentials already assigned to another UID never trigger merging',async()=>{
 auth.currentUser=user();fa.linkWithCredential.mockRejectedValueOnce({code:'auth/credential-already-in-use'});
 await expect(service.linkGoogleAccount('proof')).rejects.toMatchObject({code:'auth/credential-already-in-use'});
 expect(auth.currentUser.uid).toBe('existing');expect(exchange).not.toHaveBeenCalled();
});
test('wrong Google account cannot reauthenticate deletion',async()=>{
 auth.currentUser={...user(),providerData:[{providerId:'google.com',uid:'google-subject'}]};
 fa.reauthenticateWithCredential.mockRejectedValueOnce({code:'auth/user-mismatch'});
 await expect(service.reauthenticateGoogleAccount()).rejects.toMatchObject({code:'auth/user-mismatch'});expect(auth.currentUser.getIdToken).not.toHaveBeenCalled();
});
test('cancelled deletion reauthentication is explicit and never a success',async()=>{
 auth.currentUser={...user(),providerData:[{providerId:'google.com',uid:'google-subject'}]};GoogleSignin.signIn.mockResolvedValue({type:'cancelled'});
 await expect(service.reauthenticateGoogleAccount()).rejects.toMatchObject({code:'google/cancelled'});expect(fa.reauthenticateWithCredential).not.toHaveBeenCalled();
});
test('account switching during account choice cannot attach credentials to the new session',async()=>{
 auth.currentUser=user();GoogleSignin.signIn.mockImplementationOnce(async()=>{auth.currentUser=user('other');return nativeSuccess;});
 await expect(service.linkGoogleAccount('proof')).rejects.toMatchObject({code:'google/session-changed'});expect(fa.linkWithCredential).not.toHaveBeenCalled();
});
test('account switching during server exchange prevents replacing the new Firebase session',async()=>{
 exchange.mockImplementationOnce(async()=>{auth.currentUser=user('other');return {data:{uid:'google-uid',customToken:'synthetic-token'}};});
 await expect(service.signInGoogleAccount(false)).rejects.toMatchObject({code:'google/session-changed'});expect(fa.signInWithCustomToken).not.toHaveBeenCalled();
});
test('logout during the Google picker invalidates the late result',async()=>{
 GoogleSignin.signIn.mockImplementationOnce(async()=>{service.cancelGoogleAuthentication();return nativeSuccess;});
 await expect(service.signInGoogleAccount(false)).rejects.toMatchObject({code:'google/session-changed'});expect(exchange).not.toHaveBeenCalled();
});
test('logout while Firebase is exchanging the token cannot leave a restored Google session',async()=>{
 fa.signInWithCustomToken.mockImplementationOnce(async()=>{service.cancelGoogleAuthentication();auth.currentUser=user('google-uid');return {user:auth.currentUser};});
 await expect(service.signInGoogleAccount(false)).rejects.toMatchObject({code:'google/session-changed'});expect(auth.currentUser).toBeNull();expect(fa.signOut).toHaveBeenCalledTimes(1);
});
test('concurrent native sign-in is rejected without a second prompt',async()=>{
 let finish;GoogleSignin.signIn.mockReturnValueOnce(new Promise(r=>{finish=r;}));const pending=service.signInGoogleAccount(false);
 for(let i=0;i<5;i++)await Promise.resolve();await expect(service.signInGoogleAccount(false)).rejects.toMatchObject({code:'google/in-progress'});
 finish({type:'cancelled'});await pending;expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
});
test('missing configuration disables Google without importing native credentials',async()=>{
 delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;expect(service.googleConfigured()).toBe(false);
 await expect(service.signInGoogleAccount(false)).rejects.toMatchObject({code:'google/not-configured'});expect(GoogleSignin.signIn).not.toHaveBeenCalled();
});
test('iOS requires its client ID and registered callback scheme',()=>{
 require('react-native').Platform.OS='ios';delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;delete process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
 expect(service.googleConfigured()).toBe(false);process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID='synthetic-ios.apps.googleusercontent.com';expect(service.googleConfigured()).toBe(false);
 process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME='com.googleusercontent.apps.synthetic-ios';expect(service.googleConfigured()).toBe(true);
});
test('errors provide safe duplicate-email guidance and never print tokens',()=>{
 expect(service.googleAuthMessage({details:{reason:'google_link_required'},message:'secret-token'})).toContain('Link Google account');
 expect(service.googleAuthMessage({details:{reason:'google_registration_required'}})).toContain('Sign up');
 expect(service.googleAuthMessage({message:'secret-token'})).not.toContain('secret-token');
});
