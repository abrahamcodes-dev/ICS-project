const React=require('react'),{create,act}=require('react-test-renderer');
let mockNext;
const mockStop=jest.fn();
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:'p',status:'ready',user:{role:'patient',status:'active',fullName:'Ada Patient',email:'test@example.test'}})}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),observeAppointments:jest.fn((uid,role,next)=>{mockNext=next;return mockStop;})}));
jest.mock('../src/services/patientDoctors',()=>({getPatientDoctor:jest.fn(),getDoctorTimes:jest.fn()}));
const {getPatientDoctor,getDoctorTimes}=require('../src/services/patientDoctors');
const {PatientHomeScreen,PatientAppointments,DoctorsScreen,DoctorProfileScreen}=require('../src/screens/patient/PatientExperience');
const {Action,Field,Copy}=require('../src/ui/design');
let tree;const navigation={navigate:jest.fn()},id='a'.repeat(64);
const row=()=>({appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:Date.now()-1000,endAt:Date.now()+100000});
async function render(Component,props={}){await act(async()=>{tree=create(<Component navigation={navigation} {...props}/>);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('home exposes real quick actions and releases appointment subscription',async()=>{await render(PatientHomeScreen);await act(async()=>mockNext([row()]));await press('Find a doctor');expect(navigation.navigate).toHaveBeenCalledWith('Doctors');await press('My appointments');expect(navigation.navigate).toHaveBeenCalledWith('Appointments');await act(async()=>tree.unmount());tree=null;expect(mockStop).toHaveBeenCalled();});
test('scheduled appointment enters existing consultation; canceled remains unavailable',async()=>{await render(PatientAppointments);await act(async()=>mockNext([row()]));await press('Open consultation');expect(navigation.navigate).toHaveBeenCalledWith('Consultation',{appointmentId:id});navigation.navigate.mockClear();await act(async()=>mockNext([{...row(),status:'cancelled'}]));await press('Canceled');expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Open consultation').props.disabled).toBe(true);await press('Open consultation');expect(navigation.navigate).not.toHaveBeenCalled();});
test('doctor cards come from authorized individual profiles and are searchable',async()=>{getPatientDoctor.mockResolvedValue({uid:'d',professionalName:'Dr Example',specialty:'Cardiology'});await render(DoctorsScreen);await act(async()=>mockNext([row()]));expect(getPatientDoctor).toHaveBeenCalledWith('d');await press('View doctor');expect(navigation.navigate).toHaveBeenCalledWith('DoctorProfile',{doctorId:'d'});await act(async()=>tree.root.findByType(Field).props.onChangeText('unmatched'));expect(tree.root.findAllByType(Action).some(n=>n.props.title==='View doctor')).toBe(false);});
test('profile displays backend times and cannot fabricate a booking',async()=>{getPatientDoctor.mockResolvedValue({uid:'d',professionalName:'Dr Example',specialty:'Cardiology'});getDoctorTimes.mockResolvedValue([{doctorId:'d',startAt:2000000,endAt:3800000}]);await render(DoctorProfileScreen,{route:{params:{doctorId:'d'}}});expect(getDoctorTimes).toHaveBeenCalledWith('d');expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Booking not yet available').props.disabled).toBe(true);});
