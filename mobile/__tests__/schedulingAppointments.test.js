const React=require('react'),{create,act}=require('react-test-renderer');
const mockSession={cancel:jest.fn(),complete:jest.fn()};
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/services/schedulingService',()=>({schedulingError:()=> 'Result uncertain. Retry unchanged.'}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),readAppointmentPage:jest.fn()}));
const {readAppointmentPage}=require('../src/services/appointmentReads'),List=require('../src/screens/shared/SchedulingAppointments').default,{Action,Field,Copy}=require('../src/ui/design');
const id='a'.repeat(64),boundary=Date.now()-2700000;
const row=()=>({appointmentId:id,patientId:'p',doctorId:'d',startAt:Date.now()+3600000,endAt:Date.now()+5400000,status:'scheduled'});
let tree;const open=jest.fn(),button=title=>tree.root.findAllByType(Action).find(n=>n.props.title===title);
async function render(){await act(async()=>{tree=create(<List uid="p" role="patient" boundary={boundary} open={open}/>);});}
async function press(title){await act(async()=>button(title).props.onPress());}
beforeEach(()=>{jest.clearAllMocks();readAppointmentPage.mockResolvedValue({rows:[row()],cursor:null});mockSession.cancel.mockResolvedValue({status:'cancelled'});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('cancellation requires confirmation then refreshes appointment state',async()=>{
 await render();await press('Cancel appointment');expect(mockSession.cancel).not.toHaveBeenCalled();
 await act(async()=>tree.root.findByType(Field).props.onChangeText('Changed plans'));await press('Confirm cancellation');
 expect(mockSession.cancel).toHaveBeenCalledWith(id,'Changed plans');expect(readAppointmentPage).toHaveBeenCalledTimes(2);
});
test('uncertain cancellation keeps original reason for retry',async()=>{
 mockSession.cancel.mockRejectedValueOnce(new Error('network')).mockResolvedValue({status:'cancelled'});await render();await press('Cancel appointment');
 await act(async()=>tree.root.findByType(Field).props.onChangeText('Reason'));await press('Confirm cancellation');
 expect(tree.root.findByType(Field).props.editable).toBe(false);await press('Retry same cancellation');
 expect(mockSession.cancel.mock.calls).toEqual([[id,'Reason'],[id,'Reason']]);
});
test('duplicate decision handler cannot submit twice',async()=>{
 let resolve;mockSession.cancel.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await press('Cancel appointment');const click=button('Confirm cancellation').props.onPress;
 await act(async()=>{click();click();});expect(mockSession.cancel).toHaveBeenCalledTimes(1);await act(async()=>resolve({status:'cancelled'}));
});
test('started appointment offers consultation, not cancellation',async()=>{
 readAppointmentPage.mockResolvedValue({rows:[{...row(),startAt:Date.now()-1000}],cursor:null});await render();
 expect(button('Cancel appointment')).toBeUndefined();await press('Open consultation');expect(open).toHaveBeenCalledWith(id);
});
test('pagination deduplicates rows and preserves boundary/cursor',async()=>{
 const cursor={id:'cursor'};readAppointmentPage.mockResolvedValueOnce({rows:[row()],cursor}).mockResolvedValue({rows:[row(),{...row(),appointmentId:'b'.repeat(64)}],cursor:null});
 await render();await press('Load more appointments');expect(readAppointmentPage).toHaveBeenLastCalledWith('p','patient','upcoming',boundary,cursor,undefined);
 expect(tree.root.findAllByType(Action).filter(n=>n.props.title==='Open consultation')).toHaveLength(2);
});
test('unmounted page completion cannot restore state',async()=>{
 let resolve;readAppointmentPage.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve({rows:[row()],cursor:null}));expect(open).not.toHaveBeenCalled();
});
test('history preserves scheduled status after elapsed time',async()=>{
 readAppointmentPage.mockResolvedValue({rows:[{...row(),startAt:0,endAt:1800000}],cursor:null});
 await act(async()=>{tree=create(<List uid="p" role="patient" mode="history" boundary={boundary} open={open}/>);});
 expect(tree.root.findAllByType(Copy).some(n=>n.props.children==='scheduled')).toBe(true);expect(button('Open consultation').props.disabled).toBe(true);
});
test.each(['scheduled','cancelled','no_show','completed'])('rating action requires completed owned appointment: %s',async status=>{
 const rate=jest.fn();readAppointmentPage.mockResolvedValue({rows:[{...row(),status}],cursor:null});
 await act(async()=>{tree=create(<List uid="p" role="patient" mode="history" boundary={boundary} open={open} rate={rate}/>);});
 if(status==='completed'){await press('Rate or view my rating');expect(rate).toHaveBeenCalledWith(id);}
 else expect(button('Rate or view my rating')).toBeUndefined();
});
async function doctorRender(overrides={},role='doctor'){
 readAppointmentPage.mockResolvedValue({rows:[{...row(),startAt:Date.now()-3600000,endAt:Date.now()-1800000,...overrides}],cursor:null});
 await act(async()=>{tree=create(<List uid={role==='doctor'?'d':'p'} role={role} mode="history" boundary={boundary} open={open}/>);});
}
test('completion requires confirmation and refreshes only after acknowledgment',async()=>{
 await doctorRender();await press('Record completed appointment');expect(mockSession.complete).not.toHaveBeenCalled();
 mockSession.complete.mockResolvedValue({appointmentId:id,status:'completed',replayed:false});
 readAppointmentPage.mockResolvedValue({rows:[{...row(),status:'completed'}],cursor:null});
 await press('Confirm completion');expect(mockSession.complete).toHaveBeenCalledWith(id);expect(readAppointmentPage).toHaveBeenCalledTimes(2);
 expect(button('Record completed appointment')).toBeUndefined();
 expect(tree.root.findAllByType(Copy).some(n=>n.props.children==='completed')).toBe(true);
});
test.each([{status:'completed'},{status:'cancelled'},{status:'no_show'},{endAt:Date.now()+3600000},{doctorId:'other'}])('ineligible appointment hides completion %p',async overrides=>{
 await doctorRender(overrides);expect(button('Record completed appointment')).toBeUndefined();
});
test('patients cannot see completion',async()=>{
 await doctorRender({},'patient');expect(button('Record completed appointment')).toBeUndefined();
});
test('uncertain completion does not assert completed status and retries same outcome',async()=>{
 await doctorRender();mockSession.complete.mockRejectedValueOnce(Error('network')).mockResolvedValue({appointmentId:id,status:'completed'});
 await press('Record completed appointment');await press('Confirm completion');
 expect(readAppointmentPage).toHaveBeenCalledTimes(1);
 expect(tree.root.findAllByType(Copy).some(n=>n.props.children==='scheduled')).toBe(true);
 await press('Retry same completion');expect(mockSession.complete.mock.calls).toEqual([[id],[id]]);
});
test('duplicate completion presses submit once; late unmounted result cannot refresh',async()=>{
 let resolve;await doctorRender();mockSession.complete.mockReturnValue(new Promise(r=>{resolve=r;}));
 await press('Record completed appointment');const click=button('Confirm completion').props.onPress;
 await act(async()=>{click();click();});expect(mockSession.complete).toHaveBeenCalledTimes(1);
 await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve({appointmentId:id,status:'completed'}));expect(readAppointmentPage).toHaveBeenCalledTimes(1);
});
