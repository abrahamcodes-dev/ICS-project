jest.mock('firebase/firestore',()=>({collection:()=>({}),doc:()=>({id:'a'.repeat(20)})}));
const React=require('react'),{create,act}=require('react-test-renderer');
let mockAuthNext;let mockRole="patient";
const mockAuth={currentUser:null};let mockIdentity=null;
const mockLoad=jest.fn(async()=>mockIdentity),mockCall=jest.fn();
jest.mock('../src/services/firebaseConfig',()=>({auth:mockAuth,app:{}}));
jest.mock('../src/services/identityService',()=>({loadOwnIdentity:(...args)=>mockLoad(...args)}));
jest.mock('../src/services/avatarService',()=>({chooseAvatar:jest.fn(async()=>({uri:'file:///synthetic',dispose:jest.fn()})),uploadRegistrationAvatar:jest.fn(async()=>{})}));
jest.mock('../src/services/notificationDevice',()=>({prepareNotificationLogout:async()=>{}}));
jest.mock('firebase/auth',()=>({onAuthStateChanged:jest.fn((_,next)=>{mockAuthNext=next;next(mockAuth.currentUser);return jest.fn();}),createUserWithEmailAndPassword:jest.fn(async()=>{mockAuth.currentUser={uid:'new-user'};mockAuthNext(mockAuth.currentUser);return {user:mockAuth.currentUser};}),signOut:jest.fn(async()=>{mockAuth.currentUser=null;mockAuthNext?.(null);}),signInWithEmailAndPassword:jest.fn()}));
jest.mock('firebase/functions',()=>({getFunctions:()=>({}),httpsCallable:()=>mockCall}));
jest.mock('@react-navigation/native',()=>({DefaultTheme:{colors:{}},DarkTheme:{colors:{}},NavigationContainer:({children})=>children}));
jest.mock('../src/navigation/GuestNavigator',()=>{const React=require('react'),Form=require('../src/screens/auth/AuthForm').default;return ()=> <Form mode="register" initialRole={mockRole}/>;});
jest.mock('../src/navigation/PatientNavigator',()=> 'PatientHome');
jest.mock('../src/navigation/DoctorNavigator',()=> 'DoctorClinical');
jest.mock('../src/navigation/AdminNavigator',()=> 'Admin');
jest.mock('../src/screens/doctor/SubmitVerificationScreen',()=> 'DoctorVerification');
jest.mock('../src/screens/shared/NotificationsScreen',()=>({NotificationInbox:'Inbox'}));
const {AuthProvider}=require('../src/context/AuthContext'),Root=require('../src/navigation/RootNavigator').default;
const {Action,Field}=require('../src/ui/design');
const {logoutUser}=require('../src/services/authService');
const {createUserWithEmailAndPassword}=require('firebase/auth');
let tree;
const identity=role=>({uid:'new-user',email:'synthetic@example.test',fullName:'Synthetic Name',role,status:'active',schemaVersion:1,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',...(role==='doctor'?{verificationStatus:'pending'}:{})});
const mount=async()=>act(async()=>{tree=create(<AuthProvider><Root/></AuthProvider>);});
const press=async title=>act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());
async function fill(){const c=tree.root.findAllByType(require('../src/components/PatientConsentControls').PatientConsentControls)[0];if(c)await act(async()=>c.props.onChange({privacyAcknowledged:true,sharingDecision:'declined'}));for(const [label,value] of [['Full name','Synthetic Name'],['Email','synthetic@example.test'],['Password','password123'],['Confirm password','password123']])await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label===label).props.onChangeText(value));}
beforeEach(()=>{jest.clearAllMocks();mockRole="patient";mockAuth.currentUser=null;mockIdentity=null;mockLoad.mockImplementation(async()=>mockIdentity);jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;await logoutUser();});
test.each([['patient',false],['patient',true],['doctor',false],['doctor',true]])('%s registration photo=%s stays mounted and routes directly',async(role,photo)=>{
 let resolve;mockCall.mockReturnValue(new Promise(r=>resolve=r));mockRole=role;await mount();await fill();if(photo)await act(async()=>tree.root.findByProps({accessibilityLabel:'Choose optional profile picture',accessibilityRole:'button'}).props.onPress());await press('Create account');
 expect(tree.root.findAllByType(Field).find(n=>n.props.label==='Full name').props.value).toBe('Synthetic Name');
 expect(JSON.stringify(tree.toJSON())).not.toContain('Complete your profile');
 mockIdentity=identity(role);await act(async()=>resolve({data:mockIdentity}));
 expect(tree.root.findAllByType(role==='patient'?'PatientHome':'DoctorVerification')).toHaveLength(1);
 expect(tree.root.findAllByType('DoctorClinical')).toHaveLength(0);
 expect(mockCall).toHaveBeenCalledWith(expect.objectContaining({role,fullName:'Synthetic Name'}));
 expect(require('../src/services/avatarService').uploadRegistrationAvatar).toHaveBeenCalledTimes(photo?1:0);
 // A fresh provider rehydrates from the canonical identity, with no setup flag.
 await act(async()=>tree.unmount());tree=null;await mount();
 expect(tree.root.findAllByType(role==='patient'?'PatientHome':'DoctorVerification')).toHaveLength(1);
});
test('backend failure keeps fields and allows same-button retry without duplicate Auth creation',async()=>{
 mockCall.mockRejectedValueOnce(Error('offline'));await mount();await fill();await press('Create account');
 expect(tree.root.findAllByType(Field).find(n=>n.props.label==='Full name').props.value).toBe('Synthetic Name');
 mockCall.mockImplementation(async()=>{mockIdentity=identity('patient');return {data:mockIdentity};});await press('Create account');
 expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);expect(tree.root.findAllByType('PatientHome')).toHaveLength(1);
});
test('restored incomplete account uses registration retry and never creates another Auth user',async()=>{
 mockAuth.currentUser={uid:'new-user'};await mount();await act(async()=>tree.root.findByType(require('../src/components/PatientConsentControls').PatientConsentControls).props.onChange({privacyAcknowledged:true,sharingDecision:'declined'}));expect(JSON.stringify(tree.toJSON())).not.toContain('Complete your profile');
 await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label==='Full name').props.onChangeText('Synthetic Name'));
 mockCall.mockImplementation(async()=>{mockIdentity=identity('patient');return {data:mockIdentity};});await press('Retry account setup');
 expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();expect(tree.root.findAllByType('PatientHome')).toHaveLength(1);
});
