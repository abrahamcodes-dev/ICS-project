const React=require('react'),{create,act}=require('react-test-renderer');
let mockIdentity;
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>mockIdentity}));
jest.mock('../src/navigation/GuestNavigator',()=>()=>null);
jest.mock('../src/navigation/PatientNavigator',()=>()=>null);
jest.mock('../src/navigation/DoctorNavigator',()=>()=>null);
jest.mock('../src/navigation/AdminNavigator',()=>()=>null);
jest.mock('../src/screens/auth/AccountStatusScreen',()=>()=>null);
jest.mock('../src/screens/doctor/SubmitVerificationScreen',()=>()=>null);
jest.mock('../src/screens/shared/NotificationsScreen',()=>({NotificationInbox:()=>null}));
jest.mock('@react-navigation/native',()=>({NavigationContainer:({children})=><>{children}</>,DefaultTheme:{colors:{}},DarkTheme:{colors:{}}}));
const {Linking}=require('react-native');
const {default:Root}=require('../src/navigation/RootNavigator');
const {NavigationContainer}=require('@react-navigation/native');
const handoff=require('../src/navigation/localeRestoration');
const doctor=()=>({loading:false,registrationOpen:false,status:'ready',firebaseUid:'d',user:{uid:'d',role:'doctor',status:'active',verificationStatus:'approved'}});
let tree,unregister,urlListener;
function arm(){
 handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),null);
 unregister=handoff.registerDoctorTab(Symbol(),doctor(),'Profile',true);
 const generation=handoff.beginLocaleSelection();handoff.prepareLocaleRestoration(generation);handoff.finishLocaleRestoration(generation,true);
}
beforeEach(()=>{
 mockIdentity=doctor();handoff.discardLocaleRestoration();
 jest.spyOn(Linking,'getInitialURL').mockResolvedValue(null);
 jest.spyOn(Linking,'addEventListener').mockImplementation((_,listener)=>{urlListener=listener;return {remove:jest.fn()};});
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;unregister?.();handoff.discardLocaleRestoration();jest.restoreAllMocks();});
async function mount(){await act(async()=>{tree=create(<Root/>);});}
test('Root preserves a pending bookmark during auth loading, then retains normal Doctor gates',async()=>{
 arm();mockIdentity={...doctor(),status:'initializing',loading:true,user:null,firebaseUid:null};
 await mount();expect(tree.root.findAllByType(NavigationContainer)).toHaveLength(0);
 mockIdentity=doctor();await act(async()=>tree.update(<Root/>));
 expect(tree.root.findAllByType(NavigationContainer)).toHaveLength(1);
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBe('Profile');
});
test.each(['signedOut','identityError','identityMissing'])('Root %s invalidates the bookmark',async status=>{
 arm();mockIdentity={...doctor(),status,user:null};await mount();
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
});
test.each(['pending','rejected'])('Root %s Doctor cannot open the clinical navigator or restore',async verificationStatus=>{
 arm();mockIdentity={...doctor(),user:{...doctor().user,verificationStatus}};await mount();
 expect(tree.root.findAllByType(NavigationContainer)).toHaveLength(0);
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
});
test('Root incoming link and explicit navigation each cancel restoration',async()=>{
 arm();await mount();urlListener({url:'calladoc-demo://destination'});
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
 arm();tree.root.findByType(NavigationContainer).props.onStateChange({});
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
});
test('Root initial URL and URL inspection failure fail closed',async()=>{
 arm();Linking.getInitialURL.mockResolvedValueOnce('calladoc-demo://destination');await mount();
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
 await act(async()=>tree.unmount());tree=null;
 arm();Linking.getInitialURL.mockRejectedValueOnce(Error('URL unavailable'));await mount();
 expect(handoff.consumeDoctorTab(Symbol(),doctor())).toBeUndefined();
});
