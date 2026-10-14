const React=require('react'),{create,act}=require('react-test-renderer');
let mockNext,mockStatus='approved';const mockStop=jest.fn();
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active',verificationStatus:mockStatus,fullName:'Doctor Example',email:'doctor@example.test'},logout:jest.fn()})}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),observeAppointments:jest.fn((uid,role,next)=>{mockNext=next;return mockStop;})}));
jest.mock('../src/services/doctorProfileRead',()=>({readOwnDoctorProfile:jest.fn(async()=>({specialty:'General medicine',registrationNumber:'TEST'}))}));
const {default:Workspace,DoctorAppointmentCard,validDay}=require('../src/screens/doctor/DoctorWorkspace');
const {Action,Field}=require('../src/ui/design'),{observeAppointments}=require('../src/services/appointmentReads');
let tree;const navigation={navigate:jest.fn()},id='a'.repeat(64);
async function render(){await act(async()=>{tree=create(<Workspace navigation={navigation}/>);});}
async function tab(name){await act(async()=>tree.root.findAll(n=>n.props?.accessibilityRole==='tab'&&n.props.accessibilityLabel===name)[0].props.onPress());}
beforeEach(()=>{jest.clearAllMocks();mockStatus='approved';jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('four bottom tabs expose selection and release old listener on switch',async()=>{await render();expect(observeAppointments).toHaveBeenCalledWith('d','doctor',expect.any(Function),expect.any(Function));await tab('Schedule');expect(mockStop).toHaveBeenCalled();expect(tree.root.findByType(Field).props.label).toMatch(/Schedule date/);expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Availability editing unavailable').props.disabled).toBe(true);});
test('consultation navigation uses appointment ID and ignores late previous tab results',async()=>{await render();const late=mockNext;await tab('Consultations');await act(async()=>{late([]);mockNext([{appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:Date.now()-1000,endAt:Date.now()+10000}]);});await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title==='Open consultation').props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('ConsultationRoom',{appointmentId:id});});
test('pending doctor never subscribes to appointments',async()=>{mockStatus='pending';await render();expect(observeAppointments).not.toHaveBeenCalled();});
test('profile tab reads own profile without keeping appointment listener',async()=>{await render();await tab('Profile');expect(require('../src/services/doctorProfileRead').readOwnDoctorProfile).toHaveBeenCalledWith('d');expect(mockStop).toHaveBeenCalled();});
test('date validation rejects impossible and malformed dates',()=>{expect(validDay('2026-02-30')).toBe(false);expect(validDay('2026-02-28')).toBe(true);expect(validDay('bad')).toBe(false);});
test('canceled consultation stays disabled even if handler is invoked',async()=>{const open=jest.fn();await act(async()=>{tree=create(<DoctorAppointmentCard uid="d" now={Date.now()} open={open} appointment={{appointmentId:id,patientId:'p',doctorId:'d',status:'cancelled',startAt:0,endAt:1}}/>);});const button=tree.root.findByType(Action);expect(button.props.disabled).toBe(true);await act(async()=>button.props.onPress());expect(open).not.toHaveBeenCalled();});
