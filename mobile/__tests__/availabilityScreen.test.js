const React=require('react'),{create,act}=require('react-test-renderer');
const mockSession={ownDay:jest.fn(),replace:jest.fn()};
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true,usePreventRemove:jest.fn()}));
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:'doctor',status:'ready',user:{role:'doctor',status:'active',verificationStatus:'approved'}})}));
jest.mock('../src/screens/shared/SchedulingAppointments',()=>()=>null);
const {AvailabilityEditor}=require('../src/screens/doctor/SetAvailabilityScreen');
const {Action}=require('../src/ui/design');const {Alert}=require('react-native');
const {zonedDate,shiftDate,wallInstant,localDay}=require('../src/services/localAvailability');
let tree;const zone=Intl.DateTimeFormat().resolvedOptions().timeZone,date=shiftDate(zonedDate(zone),1);
const button=t=>tree.root.findAllByType(Action).find(n=>n.props.title===t);
async function press(t){await act(async()=>button(t).props.onPress());}
async function tap(t){await act(async()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===t)[0].props.onPress());}
async function render(){await act(async()=>{tree=create(<AvailabilityEditor uid="doctor" open={jest.fn()}/>);});await tap('Next day');}
async function add(){await press('Add availability');await press('Start: Select time');await tap('9:00 AM');await press('End: Select time');await tap('12:00 PM');}
beforeEach(()=>{jest.clearAllMocks();mockSession.ownDay.mockResolvedValue({day:null});mockSession.replace.mockResolvedValue({revision:1,changed:true});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('local pickers require review and reload authoritative hours after one write',async()=>{
 await render();await add();await press('Review changes');expect(mockSession.replace).not.toHaveBeenCalled();
 const startAt=wallInstant(date,'09:00',zone),endAt=wallInstant(date,'12:00',zone),utcDate=new Date(startAt).toISOString().slice(0,10);
 mockSession.replace.mockImplementationOnce(async input=>{mockSession.ownDay.mockImplementation(async d=>({day:d===utcDate?{utcDate,timeZone:zone,revision:1,windows:input.windows}:null}));return {revision:1};});
 await press('Save availability');expect(mockSession.replace).toHaveBeenCalledWith({utcDate,timeZone:zone,expectedRevision:0,windows:[{startAt,endAt}]});expect(JSON.stringify(tree.toJSON())).toContain('Availability saved.');expect(button('Start: 9:00 AM')).toBeDefined();
});
test('overlap blocks review; date changes ask before discarding drafts',async()=>{
 await render();await add();await add();expect(button('Review changes').props.disabled).toBe(true);
 const alert=jest.spyOn(Alert,'alert');await tap('Next day');expect(alert).toHaveBeenCalledWith('Discard unsaved hours?',expect.any(String),expect.any(Array));alert.mockRestore();
});
test.each(['functions/failed-precondition','functions/internal'])('failed save %s preserves edits, blocks retry and explains recovery',async code=>{
 await render();await add();mockSession.replace.mockRejectedValueOnce({code});await press('Review changes');await press('Save availability');
 expect(mockSession.replace).toHaveBeenCalledTimes(1);expect(button('Review changes').props.disabled).toBe(true);expect(button('Start: 9:00 AM')).toBeDefined();expect(JSON.stringify(tree.toJSON())).not.toContain('Availability saved.');
});
test('started windows are locked and empty day is explicit',async()=>{
 const today=zonedDate(zone),range=localDay(today,zone);mockSession.ownDay.mockImplementation(async d=>({day:{utcDate:d,timeZone:zone,revision:2,windows:[{startAt:Math.floor(range.start/86400000)*86400000,endAt:range.end}]}}));
 await act(async()=>{tree=create(<AvailabilityEditor uid="doctor" open={jest.fn()}/>);});expect(button('Remove window 1').props.disabled).toBe(true);
});
test('load failure exposes retry and disables editing',async()=>{mockSession.ownDay.mockRejectedValue(Error('offline'));await render();expect(JSON.stringify(tree.toJSON())).toContain('Unable to load saved hours');expect(button('Add availability').props.disabled).toBe(true);mockSession.ownDay.mockResolvedValue({day:null});await press('Reload saved availability');expect(JSON.stringify(tree.toJSON())).toContain('No availability configured');});
test('reload failure after accepted write never claims success or retries the write',async()=>{
 await render();await add();await press('Review changes');mockSession.replace.mockImplementationOnce(async()=>{mockSession.ownDay.mockRejectedValue(Error('offline'));return {revision:1};});await press('Save availability');
 expect(mockSession.replace).toHaveBeenCalledTimes(1);expect(JSON.stringify(tree.toJSON())).not.toContain('Availability saved.');expect(button('Start: 9:00 AM')).toBeDefined();expect(button('Review changes').props.disabled).toBe(true);
});
test('late previous-day response cannot overwrite selected day',async()=>{
 let finish;mockSession.ownDay.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await act(async()=>{tree=create(<AvailabilityEditor uid="doctor" open={jest.fn()}/>);});await tap('Next day');await act(async()=>finish({day:{windows:[{startAt:0,endAt:1800000}]}}));expect(button('Remove window 1')).toBeUndefined();
});

test.each([false,true])('multi-day form submits exactly one batch and handles failure=%s',async failed=>{
 await render();await add();
 const local=require('../src/services/localAvailability'),original=local.planLocalAvailability;
 const single=original(date,zone,[{startAt:wallInstant(date,'09:00',zone),endAt:wallInstant(date,'12:00',zone)}],Object.fromEntries(localDay(date,zone).dates.map(d=>[d,null])));
 const batch={days:[single,{...single,utcDate:shiftDate(single.utcDate,1),windows:single.windows.map(w=>({startAt:w.startAt+86400000,endAt:w.endAt+86400000}))}]};
 const spy=jest.spyOn(local,'planLocalAvailability').mockReturnValue(batch);mockSession.replaceMany=jest.fn();
 if(failed)mockSession.replaceMany.mockRejectedValue({code:'functions/failed-precondition'});else mockSession.replaceMany.mockResolvedValue({days:[]});
 try{await press('Review changes');await press('Save availability');expect(mockSession.replaceMany).toHaveBeenCalledTimes(1);expect(mockSession.replaceMany).toHaveBeenCalledWith(batch);expect(mockSession.replace).not.toHaveBeenCalled();
 if(failed){expect(button('Start: 9:00 AM')).toBeDefined();expect(button('Review changes').props.disabled).toBe(true);expect(JSON.stringify(tree.toJSON())).not.toContain('Availability saved.');}else expect(JSON.stringify(tree.toJSON())).toContain('Availability saved.');
 }finally{spy.mockRestore();}
});
