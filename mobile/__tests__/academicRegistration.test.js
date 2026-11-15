jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:null},app:{},db:{}}));
jest.mock('../src/services/academicDemo',()=>({isHostedAcademicDemo:()=>true}));
jest.mock('firebase/auth',()=>({reload:jest.fn(),getIdToken:jest.fn(),sendEmailVerification:jest.fn(),createUserWithEmailAndPassword:jest.fn(),signInWithEmailAndPassword:jest.fn(),signOut:jest.fn()}));
jest.mock('firebase/functions',()=>({getFunctions:()=>({}),httpsCallable:jest.fn()}));
jest.mock('firebase/firestore',()=>({getDoc:jest.fn(),doc:jest.fn(()=>({id:'a'.repeat(20)})),collection:jest.fn(()=>({}))}));
jest.mock('../src/services/notificationDevice',()=>({prepareNotificationLogout:jest.fn()}));
import {auth} from '../src/services/firebaseConfig';
import {reload,getIdToken,sendEmailVerification} from 'firebase/auth';
import {httpsCallable} from 'firebase/functions';
import {getDoc} from 'firebase/firestore';
import {completeUserRegistration} from '../src/services/authService';
import {loadOwnIdentity} from '../src/services/identityService';
import {ACADEMIC_NOTICE_VERSION} from '../src/services/academicNotice';
const identity={uid:'u1',email:'test@example.test',fullName:'Synthetic',role:'patient',status:'active',schemaVersion:1,createdAt:'2026-11-15T00:00:00.000Z',updatedAt:'2026-11-15T00:00:00.000Z'};
const choice={privacyAcknowledged:true,sharingDecision:'declined'};
beforeEach(()=>{jest.clearAllMocks();auth.currentUser={uid:'u1',emailVerified:true};reload.mockResolvedValue();getIdToken.mockResolvedValue('synthetic-token');getDoc.mockResolvedValue({exists:()=>true,data:()=>identity});});
test('unverified hosted registration sends verification and does not enter protected registration',async()=>{
 auth.currentUser.emailVerified=false;sendEmailVerification.mockResolvedValue();
 await expect(completeUserRegistration('Synthetic','patient',choice)).rejects.toMatchObject({code:'academic-email-verification'});
 expect(sendEmailVerification).toHaveBeenCalledWith(auth.currentUser);expect(httpsCallable).not.toHaveBeenCalled();
});
test('verified hosted registration refreshes claims and submits explicit versioned acknowledgement',async()=>{
 const call=jest.fn().mockResolvedValue({data:identity});httpsCallable.mockReturnValue(call);
 expect(await completeUserRegistration('Synthetic','patient',choice)).toEqual(identity);
 expect(getIdToken).toHaveBeenCalledWith(auth.currentUser,true);
 expect(call).toHaveBeenCalledWith(expect.objectContaining({role:'patient',academicNoticeVersion:ACADEMIC_NOTICE_VERSION,academicNoticeAcknowledged:true,consent:expect.objectContaining({documentVersion:ACADEMIC_NOTICE_VERSION,sharingDecision:'declined'})}));
});
test('missing hosted doctor acknowledgement cannot submit registration',async()=>{
 const call=jest.fn();httpsCallable.mockReturnValue(call);
 await expect(completeUserRegistration('Synthetic','doctor')).rejects.toMatchObject({code:'registration-incomplete'});expect(call).not.toHaveBeenCalled();
});
test('permission denial after restart routes to recovery without inventing an identity',async()=>{
 getDoc.mockRejectedValue({code:'permission-denied'});expect(await loadOwnIdentity('u1')).toBeNull();
});
test('recovery does not mask network failures or malformed identities',async()=>{
 getDoc.mockRejectedValueOnce({code:'unavailable'});await expect(loadOwnIdentity('u1')).rejects.toMatchObject({code:'unavailable'});
 getDoc.mockResolvedValueOnce({exists:()=>true,data:()=>({...identity,role:'invented'})});await expect(loadOwnIdentity('u1')).rejects.toThrow();
});
test('server admission rejection cannot produce a completed identity',async()=>{
 httpsCallable.mockReturnValue(jest.fn().mockRejectedValue({code:'permission-denied'}));
 await expect(completeUserRegistration('Synthetic','patient',choice)).rejects.toMatchObject({code:'registration-incomplete'});expect(getDoc).not.toHaveBeenCalled();
});
