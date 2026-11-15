const React=require('react'),{create,act}=require('react-test-renderer');
jest.mock('../src/services/authService',()=>({loginGoogleUser:jest.fn(),registerGoogleUser:jest.fn(),loginUser:jest.fn(),registerUser:jest.fn(),completeUserRegistration:jest.fn()}));
jest.mock('../src/services/googleAuth',()=>({googleConfigured:jest.fn(()=>true),googleAuthMessage:()=> 'Google sign-in could not be confirmed'}));
jest.mock('../src/services/avatarService',()=>({chooseAvatar:jest.fn(),uploadRegistrationAvatar:jest.fn()}));
const Form=require('../src/screens/auth/AuthForm').default,{Field,Action,Notice}=require('../src/ui/design');
const service=require('../src/services/authService'),{GoogleSignInButton}=require('../src/components/GoogleSignInButton'),{PatientConsentControls}=require('../src/components/PatientConsentControls');
let tree;beforeEach(()=>{jest.clearAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);service.loginGoogleUser.mockResolvedValue(null);service.registerGoogleUser.mockResolvedValue(null);});afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
async function render(mode='register',role='patient'){await act(async()=>{tree=create(<Form mode={mode} initialRole={role}/>);});}
async function fillName(){await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label==='Full name').props.onChangeText('Synthetic Person'));}
async function consent(){await act(async()=>tree.root.findByType(PatientConsentControls).props.onChange({privacyAcknowledged:true,sharingDecision:'declined'}));}
async function google(){await act(async()=>tree.root.findByType(GoogleSignInButton).props.onPress());}
test('Google login does not require email/password entry and preserves the email form',async()=>{
 await render('login');await google();expect(service.loginGoogleUser).toHaveBeenCalledTimes(1);expect(service.loginUser).not.toHaveBeenCalled();expect(tree.root.findAllByType(Field).map(n=>n.props.label)).toEqual(['Email','Password']);
});
test.each(['patient','doctor'])('Google registration keeps selected %s role and uses name/consent without password',async role=>{
 await render('register',role);await fillName();if(role==='patient')await consent();await google();
 expect(service.registerGoogleUser).toHaveBeenCalledWith('Synthetic Person',role,role==='patient'?{privacyAcknowledged:true,sharingDecision:'declined'}:undefined);expect(service.registerUser).not.toHaveBeenCalled();
});
test('missing name or patient consent blocks the Google prompt',async()=>{
 await render();await google();expect(service.registerGoogleUser).not.toHaveBeenCalled();await fillName();await google();expect(service.registerGoogleUser).not.toHaveBeenCalled();
 expect(JSON.stringify(tree.toJSON())).toContain('Acknowledge');
});
test('cancelled Google login stays on the same screen without an error',async()=>{
 await render('login');await google();expect(tree.root.findAllByType(Notice)).toHaveLength(0);
});
test('duplicate Google submission is locked and failures remain actionable',async()=>{
 let fail;service.loginGoogleUser.mockReturnValueOnce(new Promise((_,r)=>{fail=r;}));await render('login');await google();await google();
 expect(service.loginGoogleUser).toHaveBeenCalledTimes(1);expect(tree.root.findByType(GoogleSignInButton).props.disabled).toBe(true);
 await act(async()=>fail(Error('private token')));expect(tree.root.findByType(Notice).props.message).not.toContain('private token');
 expect(tree.root.findByType(GoogleSignInButton).props.disabled).toBe(false);
});
test('unconfigured builds show an honest disabled Google action',async()=>{
 require('../src/services/googleAuth').googleConfigured.mockReturnValueOnce(false);await render('login');expect(tree.root.findByType(GoogleSignInButton).props.disabled).toBe(true);
});
