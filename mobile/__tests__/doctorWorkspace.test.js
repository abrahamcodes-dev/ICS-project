const mockPatientRead=jest.fn(async appointmentId=>({appointmentId,patientDisplayName:'Ada Patient',patientAvatar:null}));
jest.mock('../src/services/avatarService',()=>({createAvatarSession:()=>({readAppointmentPatient:mockPatientRead,read:async()=>({revision:0,image:null,pending:null}),dispose:jest.fn()})}));
const React=require('react'),{create,act}=require('react-test-renderer');
jest.mock('../src/screens/shared/RatingPanels',()=>({DoctorRatingSummaryPanel:()=>null}));
const mockSession={ownDay:jest.fn(async()=>({day:null}))};
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/services/schedulingService',()=>({schedulingError:()=> 'Unavailable',DAY_MS:86400000,localDate:(t=Date.now())=>{const d=new Date(t);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');},localDateRange:day=>{const d=new Date(day+'T00:00:00'),e=new Date(d);e.setDate(e.getDate()+1);return {start:d.getTime(),end:e.getTime()};}}));
let mockNext,mockStatus='approved',mockAuthStatus='ready';const mockStop=jest.fn(),mockLogout=jest.fn(async()=>{});
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:mockAuthStatus,firebaseUid:'d',user:{role:'doctor',status:'active',verificationStatus:mockStatus,fullName:'Doctor Example',email:'doctor@example.test'},logout:mockLogout})}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),readAppointmentPage:jest.fn(),observeAppointments:jest.fn((uid,role,next)=>{mockNext=next;return mockStop;})}));
jest.mock('../src/services/doctorProfileRead',()=>({readOwnDoctorProfile:jest.fn(async()=>({specialty:'General medicine',registrationNumber:'TEST'}))}));
const {default:Workspace,DoctorAppointmentCard,validDay}=require('../src/screens/doctor/DoctorWorkspace');
const {Action,Field}=require('../src/ui/design'),{observeAppointments}=require('../src/services/appointmentReads');
let tree;const navigation={navigate:jest.fn()},id='a'.repeat(64);
async function render(){await act(async()=>{tree=create(<Workspace navigation={navigation}/>);});}
async function tab(name){await act(async()=>tree.root.findAll(n=>n.props?.accessibilityRole==='tab'&&n.props.accessibilityLabel===name)[0].props.onPress());}
beforeEach(()=>{jest.clearAllMocks();mockAuthStatus='ready';require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[],cursor:null});mockStatus='approved';jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('four bottom tabs expose selection and release old listener on switch',async()=>{await render();expect(observeAppointments).toHaveBeenCalledWith('d','doctor',expect.any(Function),expect.any(Function),true);await tab('Schedule');expect(mockStop).toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('Appointments (0)');await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title==='Manage availability').props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('SetAvailability');});
test('consultation navigation uses appointment ID and ignores late previous tab results',async()=>{await render();const late=mockNext;require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[{appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:Date.now()-1000,endAt:Date.now()+10000}],cursor:null});await tab('Consultations');await act(async()=>late([]));await act(async()=>tree.root.findAll(n=>n.props.accessibilityHint==='Open consultation details')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('ConsultationDetails',{appointmentId:id});});
test('pending doctor never subscribes to appointments',async()=>{mockStatus='pending';await render();expect(observeAppointments).not.toHaveBeenCalled();});

test('profile retains prescription and notification navigation within the shared screen',async()=>{
 await render();await tab('Profile');
 await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Edit profile'&&n.props.accessibilityRole==='button')[0].props.onPress());
 const {Screen}=require('../src/ui/design');
 expect(tree.root.findByType(Screen).props.variant).toBe('dashboard');
 const actions=tree.root.findAllByType(Action).filter(n=>['Consultation prescriptions','Notifications'].includes(n.props.title));
 expect(actions.map(n=>n.props.title)).toEqual(['Consultation prescriptions','Notifications']);
 await act(async()=>actions[0].props.onPress());
 expect(navigation.navigate).toHaveBeenCalledWith('IssuePrescription');
 await act(async()=>actions[1].props.onPress());
 expect(navigation.navigate).toHaveBeenCalledWith('Notifications');
});
test('profile tab reads own profile without keeping appointment listener',async()=>{await render();await tab('Profile');expect(require('../src/services/doctorProfileRead').readOwnDoctorProfile).toHaveBeenCalledWith('d');expect(mockStop).toHaveBeenCalled();});

test('profile avatar and ratings render without duplicate sibling key warnings',async()=>{
 const errors=jest.spyOn(console,'error');
 try {
  await render();await tab('Profile');
  await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Edit profile'&&n.props.accessibilityRole==='button')[0].props.onPress());
  await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Change profile picture'&&n.props.accessibilityRole==='button')[0].props.onPress());
  const {AvatarEditor}=require('../src/components/ProfileAvatar');
  const {DoctorRatingSummaryPanel}=require('../src/screens/shared/RatingPanels');
  expect(tree.root.findByType(AvatarEditor).props.uid).toBe('d');
  expect(tree.root.findByType(DoctorRatingSummaryPanel).props.uid).toBe('d');
  expect(errors.mock.calls.some(args=>args.some(value=>String(value).includes('same key')))).toBe(false);
 } finally {errors.mockRestore();}
});
test('date validation rejects impossible and malformed dates',()=>{expect(validDay('2026-02-30')).toBe(false);expect(validDay('2026-02-28')).toBe(true);expect(validDay('bad')).toBe(false);});
test('canceled consultation stays disabled even if handler is invoked',async()=>{const open=jest.fn();await act(async()=>{tree=create(<DoctorAppointmentCard uid="d" now={Date.now()} open={open} appointment={{appointmentId:id,patientId:'p',doctorId:'d',status:'cancelled',startAt:0,endAt:1}}/>);});const button=tree.root.findByType(Action);expect(button.props.disabled).toBe(true);await act(async()=>button.props.onPress());expect(open).not.toHaveBeenCalled();});

test('workspace status reflects canonical approval and selected navigation stays explicit',async()=>{
 await render();const {Status}=require('../src/ui/design');expect(tree.root.findAllByType(Status).some(n=>n.props.label==='Verified Doctor')).toBe(true);
 await tab('Schedule');const tabs=tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function');
 expect(tabs.filter(n=>n.props.accessibilityState.selected).map(n=>n.props.accessibilityLabel)).toEqual(['Schedule']);
});

test('home preserves compact actions and shows only observed appointments',async()=>{
 await render();await act(async()=>mockNext([]));
 expect(JSON.stringify(tree.toJSON())).toContain('No upcoming consultation');
 expect(JSON.stringify(tree.toJSON())).toContain('No appointments today');
 for(const [label,route] of [['Notifications','Notifications'],['Consultation prescriptions','IssuePrescription']]){
  await act(async()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===label)[0].props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(route);
 }
 await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='View all appointments')[0].props.onPress());
 expect(require('../src/services/appointmentReads').readAppointmentPage).toHaveBeenCalled();
});
test('next consultation is sorted and join rechecks eligibility at press time',async()=>{
 await render();const now=Date.now(),base={patientId:'p',doctorId:'d',status:'scheduled'};
 await act(async()=>mockNext([{...base,appointmentId:'b'.repeat(64),startAt:now+3600000,endAt:now+5400000},{...base,appointmentId:id,startAt:now-1000,endAt:now+1800000}]));
 const join=tree.root.findAllByType(Action).find(n=>n.props.title==='Join consultation');expect(join.props.disabled).toBe(false);
 await act(async()=>join.props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('ConsultationRoom',{appointmentId:id});
 await act(async()=>mockNext([{...base,appointmentId:id,startAt:now+3600000,endAt:now+5400000}]));
 navigation.navigate.mockClear();const future=tree.root.findAllByType(Action).find(n=>n.props.title==='Join consultation');expect(future.props.disabled).toBe(true);
 await act(async()=>future.props.onPress());expect(navigation.navigate).not.toHaveBeenCalled();
});
test('home excludes tomorrow from today and uses own professional name',async()=>{
 require('../src/services/doctorProfileRead').readOwnDoctorProfile.mockResolvedValueOnce({professionalName:'Dr Own Profile'});
 await render();const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(12,0,0,0);
 await act(async()=>mockNext([{appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:tomorrow.getTime(),endAt:tomorrow.getTime()+1800000}]));
 const json=JSON.stringify(tree.toJSON());expect(json).toContain('Dr Own Profile');expect(json).toContain('No appointments today');expect(json).not.toContain('No upcoming consultation');
});

test('home displays authorized patient names instead of generic labels',async()=>{
 await render();const now=Date.now();
 await act(async()=>mockNext([{appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:now+60000,endAt:now+1860000}]));
 expect(JSON.stringify(tree.toJSON())).toContain('Ada Patient');expect(JSON.stringify(tree.toJSON())).not.toContain('Patient consultation');
 expect(mockPatientRead).toHaveBeenCalledTimes(1);
});

const {weekDays,shiftDay,availabilityPartitions,supportedDay}=require('../src/screens/doctor/DoctorSchedule');
test('calendar crosses month/year boundaries and keeps Monday first',()=>{
 expect(weekDays('2026-10-29')).toEqual(['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
 expect(shiftDay('2026-12-29',7)).toBe('2027-01-05');expect(shiftDay('2024-02-28',1)).toBe('2024-02-29');
 expect(supportedDay('0099-01-01')).toBe(false);
 const day='2026-10-29',start=new Date(day+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
 const partitions=availabilityPartitions(day);expect(partitions[0]).toBe(start.toISOString().slice(0,10));expect(partitions.at(-1)).toBe(new Date(end.getTime()-1).toISOString().slice(0,10));
});
test('schedule paginates, filters selected date, shows real patient and retains date across tabs',async()=>{
 const now=Date.now(),base={appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:now-1000,endAt:now+1800000};
 const read=require('../src/services/appointmentReads').readAppointmentPage;
 read.mockResolvedValueOnce({rows:[base],cursor:{id:'next'}}).mockResolvedValueOnce({rows:[{...base,appointmentId:'b'.repeat(64),startAt:now+86400000}],cursor:null});
 await render();await tab('Schedule');
 expect(read).toHaveBeenCalledTimes(2);expect(JSON.stringify(tree.toJSON())).toContain('Appointments (1)');expect(JSON.stringify(tree.toJSON())).toContain('Ada Patient');
 await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title==='Join').props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('ConsultationRoom',{appointmentId:id});
 const press=async label=>act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&n.props.accessibilityRole==='tab')[0].props.onPress());
 await press('Saved availability');expect(JSON.stringify(tree.toJSON())).toContain('No saved availability');expect(mockSession.ownDay).toHaveBeenCalled();
 await press('Scheduled appointments');expect(JSON.stringify(tree.toJSON())).toContain('Appointments (1)');expect(read).toHaveBeenCalledTimes(2);
 await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Next week'&&n.props.accessibilityRole==='button')[0].props.onPress());
 expect(read).toHaveBeenLastCalledWith('d','doctor','day',expect.any(Number),undefined,expect.any(Number));
 expect(read.mock.calls.at(-1)[3]).toBeGreaterThan(read.mock.calls[0][3]);
});
test('schedule future appointment uses status and patient fallback, never an early Join',async()=>{
 mockPatientRead.mockResolvedValueOnce({appointmentId:id,patientDisplayName:null,patientAvatar:null});
 const now=Date.now();require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[{appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:now+1000,endAt:now+1800000}],cursor:null});
 await render();await tab('Schedule');expect(JSON.stringify(tree.toJSON())).toContain('Patient');expect(JSON.stringify(tree.toJSON())).toContain('Scheduled');expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Join')).toBe(false);
});
test('availability loads saved windows, labels timezone, and keeps a single manage action',async()=>{
 const start=new Date();start.setHours(12,0,0,0);const end=start.getTime()+3600000;
 mockSession.ownDay.mockImplementation(async date=>({day:date===start.toISOString().slice(0,10)?{windows:[{startAt:start.getTime(),endAt:end}]}:null}));
 await render();await tab('Schedule');await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Saved availability'&&n.props.accessibilityRole==='tab')[0].props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('Saved availability');expect(JSON.stringify(tree.toJSON())).toContain('Times in');expect(tree.root.findAllByType(Action).filter(n=>n.props.title==='Manage availability')).toHaveLength(1);
});
test('availability failure is explicit and can be retried',async()=>{
 mockSession.ownDay.mockRejectedValue(Error('offline'));await render();await tab('Schedule');await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Saved availability'&&n.props.accessibilityRole==='tab')[0].props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('Unable to load saved availability.');mockSession.ownDay.mockResolvedValue({day:null});
 await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title==='Retry availability').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('No saved availability on this day.');
});

test('consultation rows expand without joining and future access stays disabled',async()=>{
 const now=Date.now();require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[{appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:now+3600000,endAt:now+5400000}],cursor:null});
 await render();await tab('Consultations');expect(JSON.stringify(tree.toJSON())).toContain('Ada Patient');expect(JSON.stringify(tree.toJSON())).not.toContain('No appointments in this view.');
 expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Open consultation')).toBe(false);
 await act(async()=>tree.root.findAll(n=>n.props.accessibilityHint==='Open consultation details')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('ConsultationDetails',{appointmentId:id});
 await act(async()=>tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel==='History')[0].props.onPress());
 expect(require('../src/services/appointmentReads').readAppointmentPage).toHaveBeenLastCalledWith('d','doctor','history',expect.any(Number),undefined,undefined);
 expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Open consultation')).toBe(false);
});
test('consultation refresh retries errors and empty results are distinct from populated rows',async()=>{
 const read=require('../src/services/appointmentReads').readAppointmentPage;read.mockRejectedValueOnce(Error('offline'));
 await render();await tab('Consultations');expect(JSON.stringify(tree.toJSON())).toContain('Unable to load appointments.');
 read.mockResolvedValue({rows:[],cursor:null});await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Refresh consultations'&&n.props.accessibilityRole==='button')[0].props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('No appointments in this view.');
});
test('profile actions preserve availability and explain unsupported capabilities',async()=>{
 await render();await tab('Profile');
 const press=async label=>act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&n.props.accessibilityRole==='button')[0].props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('General medicine');
 expect(JSON.stringify(tree.toJSON())).toContain('Verified Doctor');
 await press('Manage availability');expect(navigation.navigate).toHaveBeenCalledWith('SetAvailability');
 await press('Consultation settings');expect(JSON.stringify(tree.toJSON())).toContain('preferences are not currently available');
 await press('Help & support');expect(JSON.stringify(tree.toJSON())).toContain('contact details are not currently available');
 await press('Edit profile');expect(JSON.stringify(tree.toJSON())).toContain('Approved professional information cannot currently be edited');
});
test('profile sign out prevents duplicate requests and permits retry after failure',async()=>{
 let reject;mockLogout.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;}));
 await render();await tab('Profile');
 const button=()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Sign out'&&n.props.accessibilityRole==='button')[0];
 await act(async()=>{button().props.onPress();button().props.onPress();});expect(mockLogout).toHaveBeenCalledTimes(1);expect(button().props.disabled).toBe(true);
 await act(async()=>reject(Error('offline')));expect(JSON.stringify(tree.toJSON())).toContain('Unable to sign out');expect(button().props.disabled).toBe(false);
 await act(async()=>button().props.onPress());expect(mockLogout).toHaveBeenCalledTimes(2);
});

test('Kiswahili profile actions use stable keys and keep their panel across language changes',async()=>{
 const {setLanguage}=require('../src/i18n/locale'),{tr}=require('../src/i18n/translate');
 await render();await tab('Profile');
 try {
  await act(async()=>setLanguage('sw'));
  const press=async key=>act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel===tr(key)&&n.props.accessibilityRole==='button')[0].props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain(tr('Help & support'));expect(JSON.stringify(tree.toJSON())).not.toContain('Help & support');
  await press('Manage availability');expect(navigation.navigate).toHaveBeenCalledWith('SetAvailability');
  await press('Edit profile');expect(JSON.stringify(tree.toJSON())).toContain(tr('Approved professional information cannot currently be edited. You can still change your profile picture.'));
  await act(async()=>setLanguage('en'));expect(JSON.stringify(tree.toJSON())).toContain('Approved professional information cannot currently be edited');
 } finally {await act(async()=>setLanguage('en'));}
});

test('Doctor consultation tabs translate text and accessibility labels without changing query mode',async()=>{
 const {setLanguage}=require('../src/i18n/locale');await render();await tab('Consultations');
 try {
  await act(async()=>setLanguage('sw'));
  const tabs=()=>tree.root.findAll(n=>n.props.accessibilityRole==='tab');
  expect(tabs().some(n=>n.props.accessibilityLabel==='Ijayo na inayoendelea')).toBe(true);
  expect(tabs().some(n=>n.props.accessibilityLabel==='History')).toBe(false);
  await act(async()=>tabs().find(n=>n.props.accessibilityLabel==='Historia').props.onPress());
  expect(require('../src/services/appointmentReads').readAppointmentPage).toHaveBeenLastCalledWith('d','doctor','history',expect.any(Number),undefined,undefined);
  await act(async()=>setLanguage('en'));expect(tabs().find(n=>n.props.accessibilityLabel==='History').props.accessibilityState.selected).toBe(true);
 } finally {await act(async()=>setLanguage('en'));}
});

test.each([['en','sw'],['sw','en']])('complete React root remount restores Profile for %s to %s only after auth validation',async(from,to)=>{
 const locale=require('../src/i18n/locale'),handoff=require('../src/navigation/localeRestoration');
 const store={getItem:async()=>from,setItem:jest.fn(async()=>{})};
 const native=jest.fn(async()=>true);
 try {
  await act(async()=>locale.initializeLanguage(store,native));
  handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),null);
  await render();await tab(from==='sw'?'Wasifu':'Profile');
  await act(async()=>locale.setLanguage(to));
  expect(store.setItem).toHaveBeenCalledWith(locale.LANGUAGE_KEY,to);
  await act(async()=>tree.unmount());tree=null; // destroy the entire React test root, not a rerender
  mockAuthStatus='loadingIdentity';
  await act(async()=>locale.initializeLanguage({...store,getItem:async()=>to},native));
  await render();expect(tree.root.findAll(n=>n.props.accessibilityRole==='tab')).toHaveLength(0);
  mockAuthStatus='ready';await act(async()=>tree.update(<Workspace navigation={navigation}/>));
  const selected=tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function'&&n.props.accessibilityState?.selected);
  expect(selected.map(n=>n.props.accessibilityLabel)).toEqual([to==='sw'?'Wasifu':'Profile']);
  // Consumed: an unrelated later remount defaults to Home.
  await act(async()=>tree.unmount());tree=null;await render();
  expect(tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function'&&n.props.accessibilityState?.selected).map(n=>n.props.accessibilityLabel)).toEqual([to==='sw'?'Mwanzo':'Home']);
 } finally {
  handoff.discardLocaleRestoration();mockAuthStatus='ready';
  await act(async()=>{await locale.initializeLanguage({getItem:async()=>'en',setItem:async()=>{}});await locale.setLanguage('en');});
 }
});

test('a subsequent workspace tab action cancels a pending handoff before native completion',async()=>{
 const handoff=require('../src/navigation/localeRestoration');
 handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),null);
 await render();await tab('Profile');
 const generation=handoff.beginLocaleSelection();handoff.prepareLocaleRestoration(generation);
 await tab('Schedule');handoff.finishLocaleRestoration(generation,true);
 await act(async()=>tree.unmount());tree=null;await render();
 expect(tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function'&&n.props.accessibilityState?.selected).map(n=>n.props.accessibilityLabel)).toEqual(['Home']);
});

test('a recreated authorized workspace waits for the in-flight native acknowledgement',async()=>{
 const handoff=require('../src/navigation/localeRestoration');
 handoff.finishLocaleLinkCheck(handoff.beginLocaleLinkCheck(),null);
 await render();await tab('Profile');
 const generation=handoff.beginLocaleSelection();handoff.prepareLocaleRestoration(generation);
 await act(async()=>tree.unmount());tree=null;await render();
 const selected=()=>tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function'&&n.props.accessibilityState?.selected).map(n=>n.props.accessibilityLabel);
 expect(selected()).toEqual(['Home']);
 await act(async()=>handoff.finishLocaleRestoration(generation,true));
 expect(selected()).toEqual(['Profile']);
});

test.each([1,1.3])('all four Doctor tabs share the safe-area width at font scale %s',async fontScale=>{
 const rn=require('react-native');jest.spyOn(rn,'useWindowDimensions').mockReturnValue({width:412,height:915,scale:2.625,fontScale});
 await render();const bar=tree.root.findByProps({testID:'doctor-tab-bar'});expect(rn.StyleSheet.flatten(bar.props.style)).toMatchObject({width:'100%',flexDirection:'row'});
 const tabs=bar.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function');expect(tabs.map(n=>n.props.accessibilityLabel)).toEqual(['Home','Schedule','Consultations','Profile']);
 for(const item of tabs)expect(item.props.style({pressed:false})).toMatchObject({flex:1,flexBasis:0,minWidth:0,paddingHorizontal:0,minHeight:64});
 const text=bar.findAllByType(rn.Text).find(n=>n.props.children==='Consultations');expect(text).toBeDefined();expect(text.props.allowFontScaling).not.toBe(false);expect(text.props.numberOfLines).toBeUndefined();expect(rn.StyleSheet.flatten(text.props.style)).toMatchObject({fontSize:12,alignSelf:'stretch'});
 const safe=tree.root.findAllByType(require('react-native-safe-area-context').SafeAreaView).find(n=>n.props.edges?.includes('left'));expect(safe.props.edges).toEqual(['bottom','left','right']);
 await tab('Consultations');expect(tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel==='Consultations'&&typeof n.props.style==='function')[0].props.accessibilityState.selected).toBe(true);
});
