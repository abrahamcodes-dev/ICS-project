const React=require('react'),{act,create}=require('react-test-renderer');
jest.setTimeout(30000); // Native UI cold render can exceed Jest's default 5 s.
jest.mock('../src/services/academicDemo',()=>({isHostedAcademicDemo:()=>true}));
jest.mock('../src/services/authService',()=>({registerUser:jest.fn(),completeUserRegistration:jest.fn(),loginUser:jest.fn()}));
jest.mock('../src/services/googleAuth',()=>({googleConfigured:()=>false}));
jest.mock('../src/services/payments',()=>({...jest.requireActual('../src/services/payments'),createPaymentSession:jest.fn()}));
jest.mock('../src/context/AuthContext',()=>({AuthContext:require('react').createContext({})}));
jest.mock('../src/services/adminVerification',()=>({createAdminVerificationSession:jest.fn(),adminVerificationError:()=> 'Safe retry'}));
jest.mock('react-native-pdf',()=> 'Pdf');
const {setLanguage}=require('../src/i18n/locale'),{tr}=require('../src/i18n/translate');
const {LanguageSelector}=require('../src/i18n/react'),{Action,Field,Copy}=require('../src/ui/design');
const Form=require('../src/screens/auth/AuthForm').default;
const {PatientConsentControls}=require('../src/components/PatientConsentControls');
let tree;
beforeEach(async()=>{jest.clearAllMocks();await setLanguage('en');jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;await setLanguage('en');jest.restoreAllMocks();});
async function mount(element){await act(async()=>{tree=create(element);});}
async function press(key){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===tr(key)).props.onPress());}
test('pre-login switch preserves entered draft and forwards doctor role and explicit acknowledgement unchanged',async()=>{
 await mount(<Form mode="register" initialRole="doctor" onComplete={jest.fn()}/>);
 const values={'Full name':'Synthetic Clinician','Email':'doctor@example.test','Password':'synthetic-password','Confirm password':'synthetic-password'};
 for(const [key,value]of Object.entries(values))await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label===key).props.onChangeText(value));
 await act(async()=>setLanguage('sw'));
 expect(tree.root.findAllByType(Field).find(n=>n.props.label==='Jina kamili').props.value).toBe('Synthetic Clinician');
 const choice={privacyAcknowledged:true,sharingDecision:null};
 await act(async()=>tree.root.findByType(PatientConsentControls).props.onChange(choice));
 require('../src/services/authService').registerUser.mockResolvedValue({uid:'d',role:'doctor',verificationStatus:'pending'});
 await press('Create account');expect(require('../src/services/authService').registerUser).toHaveBeenCalledWith('doctor@example.test','synthetic-password','Synthetic Clinician','doctor',choice);
});
test('Kiswahili patient checkout sends original amount, doctor ID and simulator decision',async()=>{
 await setLanguage('sw');const pending={paymentId:'a'.repeat(64),doctorDisplay:{professionalName:'Dr Original Name',specialty:'Original specialty'},startAt:Date.now()+86400000,endAt:Date.now()+88200000,amountMinor:150000,currency:'KES',status:'pending',provider:'simulated-mpesa',demo:true,expiresAt:Date.now()+300000,createdAt:Date.now()};
 const session={dispose:jest.fn(),fee:jest.fn().mockResolvedValue({amountMinor:150000,totalMinor:150000,revision:1}),history:jest.fn().mockResolvedValue({payments:[],nextCursor:null}),checkout:jest.fn().mockResolvedValue({kind:'payment',payment:pending}),decide:jest.fn().mockResolvedValue({...pending,status:'succeeded',appointmentId:pending.paymentId})};
 require('../src/services/payments').createPaymentSession.mockReturnValue(session);
 const {PatientCheckout}=require('../src/components/Payments');await mount(<PatientCheckout uid="p" doctorId="d" startAt={pending.startAt} confirmed={jest.fn()}/>);
 await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await press('Confirm demo payment');await press('Approve simulated payment');
 expect(session.checkout.mock.calls[0][0]).toMatchObject({doctorId:'d',phone:'254700000000',expectedFeeRevision:1});expect(session.decide).toHaveBeenCalledWith(pending.paymentId,'approve');
 expect(JSON.stringify(tree.toJSON())).toContain('Miadi imethibitishwa');expect(JSON.stringify(tree.toJSON())).toContain('Dr Original Name');
});
test('administrator queue localizes and still refuses a patient identity',async()=>{
 await setLanguage('sw');const {AuthContext}=require('../src/context/AuthContext'),Screen=require('../src/screens/admin/VerificationQueueScreen').default,api={queue:jest.fn().mockResolvedValue({items:[],nextCursor:null}),dispose:jest.fn()};
 require('../src/services/adminVerification').createAdminVerificationSession.mockReturnValue(api);
 await mount(<AuthContext.Provider value={{status:'ready',user:{uid:'admin',role:'administrator',status:'active'},logout:jest.fn()}}><Screen/></AuthContext.Provider>);
 expect(JSON.stringify(tree.toJSON())).toContain('Hakuna maombi ya uthibitishaji yanayosubiri.');expect(api.queue).toHaveBeenCalledTimes(1);
 await act(async()=>tree.update(<AuthContext.Provider value={{status:'ready',user:{uid:'patient',role:'patient',status:'active'}}}><Screen/></AuthContext.Provider>));
 expect(JSON.stringify(tree.toJSON())).toContain('Akaunti hai ya msimamizi inahitajika.');expect(api.queue).toHaveBeenCalledTimes(1);
});
test('language selector remains accessible and updates a mounted label without remounting',async()=>{
 function Sample(){require('../src/i18n/react').useLocale();return <><LanguageSelector/><Copy>{tr('Appointments')}</Copy></>;}
 await mount(<Sample/>);const button=tree.root.findAllByProps({accessibilityLabel:'Kiswahili'}).find(n=>typeof n.props.onPress==='function');
 await act(async()=>button.props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Miadi');
 expect(tree.root.findAllByProps({accessibilityLabel:'Kiswahili'}).some(n=>n.props.accessibilityState?.selected===true)).toBe(true);
});
test('Kiswahili doctor fee editing keeps KES minor units and revision checks',async()=>{
 await setLanguage('sw');const session={dispose:jest.fn(),fee:jest.fn().mockResolvedValue({amountMinor:0,revision:3}),summary:jest.fn().mockResolvedValue(null),setFee:jest.fn().mockResolvedValue({amountMinor:150000,revision:4}),history:jest.fn().mockResolvedValue({payments:[],nextCursor:null})};
 require('../src/services/payments').createPaymentSession.mockReturnValue(session);
 const {DoctorPayments}=require('../src/components/Payments');await mount(<DoctorPayments uid="approved-doctor"/>);
 await act(async()=>tree.root.findByType(Field).props.onChangeText('1500'));await press('Save consultation fee');
 expect(session.setFee).toHaveBeenCalledWith(150000,3);expect(JSON.stringify(tree.toJSON())).toContain('Ada ya mashauriano imehifadhiwa.');
});
test('Kiswahili administrator approval forwards the original request and decision',async()=>{
 await setLanguage('sw');const {AuthContext}=require('../src/context/AuthContext'),Screen=require('../src/screens/admin/VerificationQueueScreen').default;
 const item={requestId:'request-id',doctorUid:'doctor-id',profileRevision:1,professional:{professionalName:'Dr Original Name',specialty:'Original Specialty',registrationNumber:'TEST',issuingAuthority:'Test Board'},submittedAt:{seconds:1810000000,nanoseconds:0},credentials:[]};
 const api={queue:jest.fn().mockResolvedValue({items:[item],nextCursor:null}),review:jest.fn().mockResolvedValue({}),dispose:jest.fn(),closeCredential:jest.fn()};require('../src/services/adminVerification').createAdminVerificationSession.mockReturnValue(api);
 await mount(<AuthContext.Provider value={{status:'ready',user:{uid:'admin',role:'administrator',status:'active'},logout:jest.fn()}}><Screen/></AuthContext.Provider>);
 await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title==='Pitia Dr Original Name').props.onPress());
 await press('Approve doctor');await press('Confirm approval');expect(api.review).toHaveBeenCalledWith(item,{decision:'approved'});
});
