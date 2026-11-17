const React=require('react'),{act,create}=require('react-test-renderer');
let mockIdentity,mockRefresh,mockFocused=true;
const mockRead=jest.fn(),mockChat=jest.fn(()=>null);
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>mockFocused}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>mockIdentity}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockRefresh=fn;return jest.fn();}}));
jest.mock('../src/services/consultationHistory',()=>({readConsultationHistory:(...args)=>mockRead(...args)}));
jest.mock('../src/screens/shared/ConsultationChat',()=>({__esModule:true,default:props=>mockChat(props)}));
const Screen=require('../src/screens/shared/ConsultationHistoryScreen').default;
const id='a'.repeat(64);let tree;
beforeEach(()=>{jest.clearAllMocks();mockFocused=true;mockIdentity={status:'ready',firebaseUid:'p',user:{role:'patient',status:'active'}};mockRead.mockResolvedValue({state:'closed',canSend:false});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
const render=async()=>{await act(async()=>{tree=create(<Screen route={{params:{appointmentId:id}}}/>);});};
test.each(['patient','doctor'])('authorized %s mounts only read-only chat',async role=>{
 mockIdentity.user={role,status:'active',verificationStatus:'approved'};await render();
 expect(mockRead).toHaveBeenCalledWith(id,'p',role);expect(mockChat).toHaveBeenCalledWith(expect.objectContaining({readOnly:true,uid:'p'}));
});
test.each([{role:'admin',status:'active'},{role:'patient',status:'disabled'},{role:'doctor',status:'active',verificationStatus:'pending'}])('ineligible identity never reads %j',async user=>{
 mockIdentity.user=user;await render();expect(mockRead).not.toHaveBeenCalled();expect(mockChat).not.toHaveBeenCalled();
});
test('access failure shows no private chat',async()=>{mockRead.mockRejectedValue(new Error('denied'));await render();expect(mockChat).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('Unable to open');});
test('identity refresh removes private chat and blocks stale result',async()=>{
 let resolve;mockRead.mockReturnValue(new Promise(r=>{resolve=r;}));await render();
 await act(async()=>{mockRefresh();resolve({state:'closed',canSend:false});});expect(mockChat).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('Session changed');
});
test('blurred route does not read',async()=>{mockFocused=false;await render();expect(mockRead).not.toHaveBeenCalled();});
test('visible history label changes to Kiswahili without reopening the room',async()=>{
 const {setLanguage}=require('../src/i18n/locale');await render();
 try {await act(async()=>setLanguage('sw'));expect(JSON.stringify(tree.toJSON())).toContain('Historia ya mashauriano');expect(mockRead).toHaveBeenCalledTimes(1);}
 finally {await act(async()=>setLanguage('en'));}
});
