const React=require('react'),{create,act}=require('react-test-renderer');
let mockNext;
const mockSession={listDoctors:jest.fn(),times:jest.fn()};
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/services/schedulingService',()=>({localDate:()=> '2026-10-20',schedulingError:()=> 'Unavailable'}));
const mockStop=jest.fn();
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:'p',status:'ready',user:{role:'patient',status:'active',fullName:'Ada Patient',email:'test@example.test'}})}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),readAppointmentPage:jest.fn(),observeAppointments:jest.fn((uid,role,next)=>{mockNext=next;return mockStop;})}));
jest.mock('../src/services/patientDoctors',()=>({getPatientDoctor:jest.fn(),getDoctorTimes:jest.fn()}));
const {getPatientDoctor,getDoctorTimes}=require('../src/services/patientDoctors');
const {PatientHomeScreen,PatientAppointments,DoctorsScreen,DoctorProfileScreen}=require('../src/screens/patient/PatientExperience');
const {Action,Field,Copy}=require('../src/ui/design');
let tree;const navigation={navigate:jest.fn()},id='a'.repeat(64);
const row=()=>({appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:Date.now()-1000,endAt:Date.now()+100000});
async function render(Component,props={}){await act(async()=>{tree=create(<Component navigation={navigation} {...props}/>);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
beforeEach(()=>{jest.clearAllMocks();require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[],cursor:null});mockSession.listDoctors.mockResolvedValue({items:[],nextCursor:null});mockSession.times.mockResolvedValue([]);jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('home exposes real quick actions and releases appointment subscription',async()=>{await render(PatientHomeScreen);await act(async()=>mockNext([row()]));await press('Find a doctor');expect(navigation.navigate).toHaveBeenCalledWith('Doctors');await press('My appointments');expect(navigation.navigate).toHaveBeenCalledWith('Appointments');await act(async()=>tree.unmount());tree=null;expect(mockStop).toHaveBeenCalled();});
test('scheduled appointment enters existing consultation; canceled remains unavailable',async()=>{require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[row()],cursor:null});await render(PatientAppointments);await press('Open consultation');expect(navigation.navigate).toHaveBeenCalledWith('Consultation',{appointmentId:id});navigation.navigate.mockClear();require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[{...row(),status:'cancelled'}],cursor:null});await press('Appointment history');expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Open consultation').props.disabled).toBe(true);await press('Open consultation');expect(navigation.navigate).not.toHaveBeenCalled();});
test('doctor cards come from approved directory and search only loaded results',async()=>{mockSession.listDoctors.mockResolvedValue({items:[{uid:'d',professionalName:'Dr Example',specialty:'Cardiology'}],nextCursor:null});await render(DoctorsScreen);expect(mockSession.listDoctors).toHaveBeenCalledWith(undefined);await press('View doctor');expect(navigation.navigate).toHaveBeenCalledWith('DoctorProfile',{doctorId:'d'});await act(async()=>tree.root.findByType(Field).props.onChangeText('unmatched'));expect(tree.root.findAllByType(Action).some(n=>n.props.title==='View doctor')).toBe(false);});
test('profile selects a backend time through typed booking navigation',async()=>{getPatientDoctor.mockResolvedValue({uid:'d',professionalName:'Dr Example',specialty:'Cardiology'});mockSession.times.mockResolvedValue([{doctorId:'d',startAt:2000000,endAt:3800000}]);await render(DoctorProfileScreen,{route:{params:{doctorId:'d'}}});expect(mockSession.times).toHaveBeenCalledWith('d','2026-10-20');await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title.startsWith('Select ')).props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('BookAppointment',{doctorId:'d',startAt:2000000});});

test('directory paginates through empty continuation and deduplicates loaded profiles',async()=>{
 const d={uid:'d',professionalName:'Doctor',specialty:'Medicine'};
 mockSession.listDoctors.mockResolvedValueOnce({items:[],nextCursor:'excluded'}).mockResolvedValueOnce({items:[d],nextCursor:'d'}).mockResolvedValue({items:[d,{...d,uid:'other'}],nextCursor:null});
 await render(DoctorsScreen);await press('Load more doctors');expect(mockSession.listDoctors).toHaveBeenLastCalledWith('excluded');
 await press('Load more doctors');expect(tree.root.findAllByType(Action).filter(n=>n.props.title==='View doctor')).toHaveLength(2);
});
test('directory failure offers refresh without fabricated doctors',async()=>{
 mockSession.listDoctors.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({items:[],nextCursor:null});
 await render(DoctorsScreen);expect(tree.root.findAllByType(Action).filter(n=>n.props.title==='View doctor')).toHaveLength(0);
 await press('Refresh doctors');expect(mockSession.listDoctors).toHaveBeenCalledTimes(2);
});
test('patient home opens the existing health assistant route',async()=>{
 await render(PatientHomeScreen);await press('Health assistant');expect(navigation.navigate).toHaveBeenCalledWith('Chatbot');
});
