const React=require('react'),{create,act}=require('react-test-renderer');
let mockUid='patient';const mockSession={selectBooking:jest.fn(),book:jest.fn(),dispose:jest.fn()};
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:mockUid,status:'ready',user:{role:'patient',status:'active'}})}));
jest.mock('../src/services/patientDoctors',()=>({getPatientDoctor:jest.fn(async()=>({uid:'doctor',professionalName:'Doctor',specialty:'Medicine'}))}));
jest.mock('../src/services/schedulingService',()=>({schedulingError:()=> 'Result uncertain. Retry same request.'}));
const Screen=require('../src/screens/patient/BookAppointmentScreen').default,{Action,Copy,Notice}=require('../src/ui/design');
const start=Math.ceil((Date.now()+3600000)/1800000)*1800000,route={params:{doctorId:'doctor',startAt:start}},navigation={navigate:jest.fn()};
let tree;const button=title=>tree.root.findAllByType(Action).find(n=>n.props.title===title);
async function render(){await act(async()=>{tree=create(<Screen route={route} navigation={navigation}/>);});}
async function press(title){await act(async()=>button(title).props.onPress());}
beforeEach(()=>{jest.clearAllMocks();mockUid='patient';mockSession.book.mockResolvedValue({status:'scheduled'});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('review requires explicit submit then shows validated adapter success and appointment navigation',async()=>{
 await render();expect(mockSession.selectBooking).toHaveBeenCalledWith('doctor',start);expect(mockSession.book).not.toHaveBeenCalled();
 await press('Confirm booking');expect(tree.root.findAllByType(Copy).some(n=>n.props.children==='Appointment confirmed.')).toBe(true);
 await press('View appointments');expect(navigation.navigate).toHaveBeenCalledWith('Appointments');
});
test('uncertain response retries same session intent',async()=>{
 mockSession.book.mockRejectedValueOnce({code:'functions/deadline-exceeded'}).mockResolvedValue({status:'scheduled'});
 await render();await press('Confirm booking');expect(tree.root.findAllByType(Notice).some(n=>!!n.props.message)).toBe(true);
 await press('Retry same booking');expect(mockSession.selectBooking).toHaveBeenCalledTimes(1);expect(mockSession.book).toHaveBeenCalledTimes(2);
});
test('duplicate taps do not issue another request',async()=>{
 let resolve;mockSession.book.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();const click=button('Confirm booking').props.onPress;
 await act(async()=>{click();click();});expect(mockSession.book).toHaveBeenCalledTimes(1);
 await act(async()=>resolve({status:'scheduled'}));
});
test('slot conflict disables retry and never selects another time',async()=>{
 mockSession.book.mockRejectedValue({code:'functions/already-exists'});await render();await press('Confirm booking');
 expect(button('Retry same booking').props.disabled).toBe(true);expect(mockSession.selectBooking).toHaveBeenCalledTimes(1);
 await press('Return to available times');expect(navigation.navigate).toHaveBeenCalledWith('DoctorProfile',{doctorId:'doctor'});
});
test('late result after logout cannot display success',async()=>{
 let resolve;mockSession.book.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await press('Confirm booking');
 mockUid=null;await act(async()=>tree.update(<Screen route={route} navigation={navigation}/>));await act(async()=>resolve({status:'scheduled'}));
 expect(tree.root.findAllByType(Copy).some(n=>n.props.children==='Appointment confirmed.')).toBe(false);
});
test('terminal replay is not presented as a new booking',async()=>{
 mockSession.book.mockResolvedValue({status:'cancelled'});await render();await press('Confirm booking');
 expect(tree.root.findAllByType(Copy).some(n=>typeof n.props.children==='string'&&n.props.children.includes('No new appointment'))).toBe(true);
});
