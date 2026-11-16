const React=require('react'),{act,create}=require('react-test-renderer');
jest.mock('../src/services/academicDemo',()=>({isHostedAcademicDemo:()=>true}));
jest.mock('../src/services/authService',()=>({loginUser:jest.fn(),registerUser:jest.fn(),completeUserRegistration:jest.fn(),registerGoogleUser:jest.fn(),loginGoogleUser:jest.fn()}));
jest.mock('../src/services/googleAuth',()=>({googleConfigured:()=>true,googleAuthMessage:()=> 'Google sign-in could not be confirmed'}));
const Form=require('../src/screens/auth/AuthForm').default,service=require('../src/services/authService');
const {Field,Action}=require('../src/ui/design'),{PatientConsentControls}=require('../src/components/PatientConsentControls'),{GoogleSignInButton}=require('../src/components/GoogleSignInButton');
let tree,onComplete;
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);onComplete=jest.fn();});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
async function render(mode,role){await act(async()=>{tree=create(<Form mode={mode} initialRole={role} onComplete={onComplete}/>);});await fill('Full name','Synthetic Doctor');if(mode==='register'){await fill('Email','synthetic@example.test');await fill('Password','synthetic-password');await fill('Confirm password','synthetic-password');}}
async function fill(label,value){await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label===label).props.onChangeText(value));}
async function acknowledge(role){const choice={privacyAcknowledged:true,sharingDecision:role==='patient'?'declined':null};expect(tree.root.findByType(PatientConsentControls).props.noticeOnly).toBe(role==='doctor');await act(async()=>tree.root.findByType(PatientConsentControls).props.onChange(choice));return choice;}
async function submit(mode){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===(mode==='recover'?'Retry account setup':'Create account')).props.onPress());}

test.each([['register','doctor'],['recover','doctor'],['register','patient'],['recover','patient']])('hosted %s forwards explicit %s acknowledgement without inventing sharing consent',async(mode,role)=>{
 await render(mode,role);const choice=await acknowledge(role),identity={uid:'confirmed',role,...(role==='doctor'?{verificationStatus:'pending'}:{})};
 const action=mode==='recover'?service.completeUserRegistration:service.registerUser;action.mockResolvedValueOnce(identity);await submit(mode);
 expect(action).toHaveBeenCalledWith(...(mode==='recover'?['Synthetic Doctor',role,choice]:['synthetic@example.test','synthetic-password','Synthetic Doctor',role,choice]));
 expect(onComplete).toHaveBeenCalledWith('confirmed');if(mode==='recover')expect(service.registerUser).not.toHaveBeenCalled();
});

test('hosted doctor recovery does not synthesize a missing acknowledgement or report success',async()=>{
 await render('recover','doctor');service.completeUserRegistration.mockRejectedValueOnce({code:'registration-incomplete'});await submit('recover');
 expect(service.completeUserRegistration).toHaveBeenCalledWith('Synthetic Doctor','doctor',{privacyAcknowledged:false,sharingDecision:null});expect(onComplete).not.toHaveBeenCalled();expect(service.registerUser).not.toHaveBeenCalled();
});

test('hosted Google doctor registration forwards notice-only acknowledgement',async()=>{
 await render('register','doctor');const choice=await acknowledge('doctor');service.registerGoogleUser.mockResolvedValueOnce({uid:'google-doctor',role:'doctor',verificationStatus:'pending'});
 await act(async()=>tree.root.findByType(GoogleSignInButton).props.onPress());expect(service.registerGoogleUser).toHaveBeenCalledWith('Synthetic Doctor','doctor',choice);expect(service.registerUser).not.toHaveBeenCalled();expect(onComplete).toHaveBeenCalledWith('google-doctor');
});
