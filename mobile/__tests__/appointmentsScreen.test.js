const React=require('react'),{act,create}=require('react-test-renderer'),{Button}=require('react-native');
let mockNext, mockRole='patient';
const mockStop=jest.fn();
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:'ready',firebaseUid:mockRole==='patient'?'p':'d',user:{role:mockRole,status:'active'}})}));
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),observeAppointments:jest.fn((uid,role,next)=>{mockNext=next;return mockStop;})}));
const {AppointmentList,PatientAppointmentsScreen,DoctorAppointmentsScreen}=require('../src/screens/shared/AppointmentsScreen');
let tree;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test.each(['patient','doctor'])('%s navigation carries exact appointment ID and unmount stops subscription',async role=>{
 mockRole=role;const Screen=role==='patient'?PatientAppointmentsScreen:DoctorAppointmentsScreen;
 const navigate=jest.fn(),id='a'.repeat(64);await act(async()=>{tree=create(<Screen navigation={{navigate}}/>);});
 await act(async()=>mockNext([{appointmentId:id,patientId:'p',doctorId:'d',startAt:Date.now()-1000,endAt:Date.now()+1000,status:'scheduled'}]));
 await act(async()=>tree.root.findByType(Button).props.onPress());expect(navigate).toHaveBeenCalledWith(role==='patient'?'Consultation':'ConsultationRoom',{appointmentId:id});
 await act(async()=>tree.unmount());tree=null;expect(mockStop).toHaveBeenCalled();
});
test('expired appointment cannot navigate even if press is invoked',async()=>{
 const open=jest.fn();await act(async()=>{tree=create(<AppointmentList uid="d" role="doctor" open={open}/>);});
 await act(async()=>mockNext([{appointmentId:'a'.repeat(64),patientId:'p',doctorId:'d',startAt:0,endAt:1,status:'scheduled'}]));
 const button=tree.root.findByType(Button);expect(button.props.disabled).toBe(true);await act(async()=>button.props.onPress());expect(open).not.toHaveBeenCalled();
});
