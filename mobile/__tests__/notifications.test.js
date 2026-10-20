const mockCall=jest.fn(),mockAuth={currentUser:{uid:'p'}},mockPermission=jest.fn(),mockToken=jest.fn();
let mockIdentity;
jest.mock('../src/services/firebaseConfig',()=>({auth:mockAuth,functions:{}}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn(()=>mockCall)}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
jest.mock('expo-notifications',()=>({requestPermissionsAsync:()=>mockPermission(),getDevicePushTokenAsync:()=>mockToken(),
 setNotificationChannelAsync:jest.fn(),AndroidImportance:{DEFAULT:3}}));
const {createNotificationSession}=require('../src/services/notificationService');
const {registerForPushNotifications,revokeNotificationDevice,prepareNotificationLogout}=require('../src/services/notificationDevice');
const {Platform}=require('react-native'),id='a'.repeat(64),item={id,kind:'message',createdAt:123,read:false};
beforeEach(()=>{jest.clearAllMocks();mockAuth.currentUser={uid:'p'};Platform.OS='android';mockCall.mockReset().mockImplementation(async d=>({data:{registered:d.enabled,deliveryEnabled:false}}));mockPermission.mockResolvedValue({status:'granted'});mockToken.mockResolvedValue({type:'android',data:'synthetic-device-token-123456789'});});
afterEach(async()=>{mockAuth.currentUser={uid:'p'};mockCall.mockResolvedValue({data:{registered:false}});await revokeNotificationDevice();});
test('bounded list and one reminder refresh; content fields stripped',async()=>{
 const s=createNotificationSession('p');mockCall.mockResolvedValueOnce({data:{items:[],nextCursor:null,remindersCreated:true}})
 .mockResolvedValue({data:{items:[{...item,text:'must not expose'}],nextCursor:null,remindersCreated:false}});
 expect(await s.list()).toEqual({items:[item],nextCursor:null});expect(mockCall).toHaveBeenCalledTimes(2);s.dispose();
});
test('mark/read and navigation require server acknowledgment',async()=>{
 const s=createNotificationSession('p');mockCall.mockResolvedValueOnce({data:{read:true}});await s.read(id);
 mockCall.mockResolvedValue({data:{target:'consultation',appointmentId:id}});expect(await s.open(id)).toEqual({target:'consultation',appointmentId:id});
 mockCall.mockResolvedValue({data:{target:'administrator'}});await expect(s.open(id)).rejects.toThrow();s.dispose();
});
test.each(['identity','dispose','account'])('stale %s response rejected',async kind=>{
 let resolve;const s=createNotificationSession('p');mockCall.mockReturnValue(new Promise(r=>{resolve=r;}));const result=s.list();
 if(kind==='identity')mockIdentity();if(kind==='dispose')s.dispose();if(kind==='account')mockAuth.currentUser={uid:'other'};
 resolve({data:{items:[item],nextCursor:null}});await expect(result).rejects.toThrow('Session changed');s.dispose();
});
test('denied permission leaves inbox independent and does not register',async()=>{
 mockPermission.mockResolvedValue({status:'denied'});expect(await registerForPushNotifications()).toContain('denied');
 expect(mockToken).not.toHaveBeenCalled();expect(mockCall).not.toHaveBeenCalled();
});
test('native token registration is serialized, explicit about disabled delivery and revoked before logout',async()=>{
 const a=registerForPushNotifications(),b=registerForPushNotifications();expect(a).toBe(b);
 expect(await a).toContain('delivery is disabled');expect(mockCall).toHaveBeenCalledWith({token:'synthetic-device-token-123456789',enabled:true});
 await prepareNotificationLogout();expect(mockCall).toHaveBeenLastCalledWith({token:'synthetic-device-token-123456789',enabled:false});
});
test('uncertain registration retains revocation intent; failed revocation prevents logout completion',async()=>{
 mockCall.mockRejectedValueOnce(Error('network'));expect(await registerForPushNotifications()).toContain('unconfirmed');
 mockCall.mockRejectedValueOnce(Error('network'));await expect(prepareNotificationLogout()).rejects.toThrow();
 mockCall.mockResolvedValue({data:{registered:false}});await prepareNotificationLogout();expect(mockCall).toHaveBeenLastCalledWith({token:'synthetic-device-token-123456789',enabled:false});
});
test('missing native credentials handled without claiming registration or delivery',async()=>{
 mockToken.mockRejectedValue(Error('native setup'));expect(await registerForPushNotifications()).toContain('unavailable');
 expect(mockCall).not.toHaveBeenCalled();
});
