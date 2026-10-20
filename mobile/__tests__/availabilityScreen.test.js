const React=require('react'),{create,act}=require('react-test-renderer');
const mockSession={ownDay:jest.fn(),replace:jest.fn()};
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:'doctor',status:'ready',user:{role:'doctor',status:'active',verificationStatus:'approved'}})}));
jest.mock('../src/services/firebaseConfig',()=>({}));
jest.mock('firebase/auth',()=>({}));jest.mock('firebase/functions',()=>({}));
jest.mock('../src/screens/shared/SchedulingAppointments',()=>()=>null);
const {AvailabilityEditor}=require('../src/screens/doctor/SetAvailabilityScreen');
const {Action,Field,Copy,Notice}=require('../src/ui/design');
let tree;const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),base=Date.parse(tomorrow+'T00:00:00Z');
const saved=()=>({day:{utcDate:tomorrow,revision:2,timeZone:'UTC',windows:[{startAt:base+36000000,endAt:base+39600000}]}});
const button=title=>tree.root.findAllByType(Action).find(n=>n.props.title===title);
async function press(title){await act(async()=>button(title).props.onPress());}
async function render(){await act(async()=>{tree=create(<AvailabilityEditor uid="doctor" open={jest.fn()}/>);});await act(async()=>tree.root.findByProps({label:'UTC scheduling date (YYYY-MM-DD)'}).props.onChangeText(tomorrow));}
beforeEach(()=>{jest.clearAllMocks();mockSession.ownDay.mockResolvedValue(saved());mockSession.replace.mockResolvedValue({revision:3,changed:true});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('loads revision, preserves timezone and requires confirmation before replacement',async()=>{
 await render();expect(mockSession.ownDay).toHaveBeenLastCalledWith(tomorrow);
 await act(async()=>tree.root.findByProps({label:'Window 1 UTC end'}).props.onChangeText('11:30'));
 expect(mockSession.replace).not.toHaveBeenCalled();await press('Review replacement');await press('Confirm availability replacement');
 expect(mockSession.replace).toHaveBeenCalledWith({utcDate:tomorrow,timeZone:'UTC',expectedRevision:2,windows:[{startAt:base+36000000,endAt:base+41400000}]});
 expect(mockSession.ownDay.mock.calls.length).toBeGreaterThan(2);
 expect(button('Reload saved availability').props.disabled).toBe(false);
});
test('invalid or overlapping window cannot be confirmed',async()=>{
 await render();await press('Add window');await act(async()=>tree.root.findByProps({label:'Window 2 UTC start'}).props.onChangeText('10:30'));
 await act(async()=>tree.root.findByProps({label:'Window 2 UTC end'}).props.onChangeText('11:30'));
 expect(button('Review replacement').props.disabled).toBe(true);expect(mockSession.replace).not.toHaveBeenCalled();
});
test('stale revision requires reload and does not silently retry overwrite',async()=>{
 mockSession.replace.mockRejectedValue({code:'functions/failed-precondition'});await render();await press('Review replacement');await press('Confirm availability replacement');
 expect(button('Review replacement')).toBeUndefined();expect(mockSession.replace).toHaveBeenCalledTimes(1);
 expect(tree.root.findAllByType(Notice).some(n=>n.props.message?.includes('revision'))).toBe(true);
 await press('Reload saved availability');expect(button('Review replacement')).toBeDefined();
});
test('started saved window is immutable in editor',async()=>{
 const today=new Date().toISOString().slice(0,10),first=Date.parse(today+'T00:00:00Z');
 mockSession.ownDay.mockResolvedValue({day:{utcDate:today,revision:1,timeZone:'UTC',windows:[{startAt:first,endAt:first+86400000}]}});
 await act(async()=>{tree=create(<AvailabilityEditor uid="doctor" open={jest.fn()}/>);});
 expect(tree.root.findByProps({label:'Window 1 UTC start'}).props.editable).toBe(false);expect(button('Remove window 1').props.disabled).toBe(true);
});
test('date change ignores late old day response',async()=>{
 let resolve;mockSession.ownDay.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({day:null});
 await act(async()=>{tree=create(<AvailabilityEditor uid="doctor" open={jest.fn()}/>);});
 await act(async()=>tree.root.findByProps({label:'UTC scheduling date (YYYY-MM-DD)'}).props.onChangeText(tomorrow));
 await act(async()=>resolve(saved()));expect(tree.root.findAllByType(Field).some(n=>n.props.label==='Window 1 UTC start')).toBe(false);
});
