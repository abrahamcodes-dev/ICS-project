const React=require('react'),{create,act}=require('react-test-renderer');
let mockNext,mockError;
const mockInbox={list:jest.fn(),dispose:jest.fn()};
jest.mock('../src/services/notificationService',()=>({createNotificationSession:()=>mockInbox}));
jest.mock('../src/components/ProfileAvatar',()=>({ProfileAvatar:props=>require('react').createElement('Avatar',props),AvatarEditor:()=>null}));
const mockSession={listDoctors:jest.fn(),times:jest.fn()};
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/services/schedulingService',()=>({localDate:()=> '2026-10-20',schedulingError:()=> 'Unavailable'}));
const mockStop=jest.fn();
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:'p',status:'ready',user:{role:'patient',status:'active',fullName:'Ada Patient',email:'test@example.test'}})}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),readAppointmentPage:jest.fn(),observeAppointments:jest.fn((uid,role,next,error)=>{mockNext=next;mockError=error;return mockStop;})}));
jest.mock('../src/services/patientDoctors',()=>({getPatientDoctor:jest.fn(),getDoctorTimes:jest.fn()}));
const {getPatientDoctor,getDoctorTimes}=require('../src/services/patientDoctors');
const {PatientHomeScreen,PatientAppointments,DoctorsScreen,DoctorProfileScreen}=require('../src/screens/patient/PatientExperience');
const {Action,Field,Copy}=require('../src/ui/design');
let tree;const navigation={navigate:jest.fn(),canGoBack:jest.fn(()=>true),goBack:jest.fn()},id='a'.repeat(64);
const row=()=>({appointmentId:id,patientId:'p',doctorId:'d',status:'scheduled',startAt:Date.now()-1000,endAt:Date.now()+100000});
async function render(Component,props={}){await act(async()=>{tree=create(<Component navigation={navigation} {...props}/>);});}
async function press(title){await act(async()=>{const action=tree.root.findAllByType(Action).find(n=>n.props.title===title);if(action)action.props.onPress();else tree.root.findByProps({accessibilityLabel:title}).props.onPress();});}
beforeEach(()=>{jest.clearAllMocks();mockInbox.list.mockResolvedValue({items:[],nextCursor:null});getPatientDoctor.mockResolvedValue({uid:"d",professionalName:"Dr Real",specialty:"Dermatology"});require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[],cursor:null});mockSession.listDoctors.mockResolvedValue({items:[],nextCursor:null});mockSession.times.mockResolvedValue([]);jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('home exposes real quick actions and releases appointment subscription',async()=>{await render(PatientHomeScreen);await act(async()=>mockNext([row()]));await press('Consult a doctor');expect(navigation.navigate).toHaveBeenCalledWith('Doctors');await press('View all appointments');expect(navigation.navigate).toHaveBeenCalledWith('Appointments');await act(async()=>tree.unmount());tree=null;expect(mockStop).toHaveBeenCalled();});
test('scheduled appointment enters existing consultation; canceled remains unavailable',async()=>{require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[row()],cursor:null});await render(PatientAppointments);await expandAppointment();await press('Open consultation');expect(navigation.navigate).toHaveBeenCalledWith('Consultation',{appointmentId:id});navigation.navigate.mockClear();require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[{...row(),status:'cancelled'}],cursor:null});await press('Appointment History');await expandAppointment();expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Open consultation').props.disabled).toBe(true);await press('Open consultation');expect(navigation.navigate).not.toHaveBeenCalled();});
test('doctor cards come from approved directory and search only loaded results',async()=>{mockSession.listDoctors.mockResolvedValue({items:[{uid:'d',professionalName:'Dr Example',specialty:'Cardiology'}],nextCursor:null});await render(DoctorsScreen);expect(mockSession.listDoctors).toHaveBeenCalledWith(undefined);await press('View doctor: Dr Example');expect(navigation.navigate).toHaveBeenCalledWith('DoctorProfile',{doctorId:'d'});await act(async()=>tree.root.findByProps({accessibilityLabel:'Search by name or specialty'}).props.onChangeText('unmatched'));expect(tree.root.findAll(n=>n.props.testID==='directory-doctor-card').length>0).toBe(false);});
test('profile selects a backend time through typed booking navigation',async()=>{getPatientDoctor.mockResolvedValue({uid:'d',professionalName:'Dr Example',specialty:'Cardiology'});mockSession.times.mockResolvedValue([{doctorId:'d',startAt:2000000,endAt:3800000}]);await render(DoctorProfileScreen,{route:{params:{doctorId:'d'}}});expect(mockSession.times).toHaveBeenCalledWith('d','2026-10-20',30);await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title.startsWith('Select ')).props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('BookAppointment',{doctorId:'d',startAt:2000000,durationMinutes:30});});

test('directory paginates through empty continuation and deduplicates loaded profiles',async()=>{
 const d={uid:'d',professionalName:'Doctor',specialty:'Medicine'};
 mockSession.listDoctors.mockResolvedValueOnce({items:[],nextCursor:'excluded'}).mockResolvedValueOnce({items:[d],nextCursor:'d'}).mockResolvedValue({items:[d,{...d,uid:'other'}],nextCursor:null});
 await render(DoctorsScreen);await press('Load more doctors');expect(mockSession.listDoctors).toHaveBeenLastCalledWith('excluded');
 await press('Load more doctors');expect(tree.root.findAll(n=>n.props.testID==='directory-doctor-card'&&typeof n.props.style==='function')).toHaveLength(2);
});
test('directory failure offers refresh without fabricated doctors',async()=>{
 mockSession.listDoctors.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({items:[],nextCursor:null});
 await render(DoctorsScreen);expect(tree.root.findAll(n=>n.props.testID==='directory-doctor-card'&&typeof n.props.style==='function')).toHaveLength(0);
 await press('Refresh doctors');expect(mockSession.listDoctors).toHaveBeenCalledTimes(2);
});
test('patient home opens the existing health assistant route',async()=>{
 await render(PatientHomeScreen);await press('Health assistant');expect(navigation.navigate).toHaveBeenCalledWith('Chatbot');
});

test('dashboard search and specialty shortcuts open real discovery',async()=>{
 await render(PatientHomeScreen);await act(async()=>tree.root.findByProps({accessibilityLabel:'Search doctors or specialties'}).props.onChangeText('Cardiology'));
 await press('Search doctors');expect(navigation.navigate).toHaveBeenCalledWith('Doctors',{search:'Cardiology'});
 await press('Dermatology');expect(navigation.navigate).toHaveBeenCalledWith('Doctors',{search:'Dermatology'});
 const {Screen}=require('../src/ui/design'),{PatientMenu}=require('../src/screens/patient/PatientMenu');
 expect(tree.root.findByType(Screen).props.footer.type).toBe(PatientMenu);expect(tree.root.findByType(PatientMenu).props.active).toBe('Home');
});
test('loaded specialty filters combine with search and can be cleared',async()=>{
 mockSession.listDoctors.mockResolvedValue({items:[{uid:'a',professionalName:'Dr Ada',specialty:'Cardiology'},{uid:'b',professionalName:'Dr Bea',specialty:'Dermatology'}],nextCursor:null});
 await render(DoctorsScreen,{route:{params:{search:'Dr'}}});await press('Cardiology');
 expect(tree.root.findAll(n=>n.props.testID==='directory-doctor-card'&&typeof n.props.style==='function')).toHaveLength(1);
 await press('View doctor: Dr Ada');expect(navigation.navigate).toHaveBeenLastCalledWith('DoctorProfile',{doctorId:'a'});
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Search by name or specialty'}).props.onChangeText('Bea'));expect(tree.root.findAll(n=>n.props.testID==='directory-doctor-card'&&typeof n.props.style==='function')).toHaveLength(0);
 await press('All');expect(tree.root.findAll(n=>n.props.testID==='directory-doctor-card'&&typeof n.props.style==='function')).toHaveLength(1);
});
test('patient footer exposes one selected tab and preserves destination',async()=>{
 const {PatientMenu}=require('../src/screens/patient/PatientMenu');await render(PatientMenu,{active:'Appointments'});
 const tabs=tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.style==='function');expect(tabs).toHaveLength(4);
 expect(tabs.filter(n=>n.props.accessibilityState.selected).map(n=>n.props.accessibilityLabel)).toEqual(['Appointments']);
 await act(async()=>tabs.find(n=>n.props.accessibilityLabel==='Doctors').props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('Doctors');
});

test('home shows greeting, specialty medical icons, honest empty state and preserved links',async()=>{
 await render(PatientHomeScreen);expect(JSON.stringify(tree.toJSON())).toContain('Loading appointments');await act(async()=>mockNext([]));
 const json=JSON.stringify(tree.toJSON());expect(json).toContain('Ada');expect(json).toContain('No upcoming appointments');
 for(const name of ['stethoscope','skin','baby','brain'])expect(tree.root.findAllByProps({testID:'icon-'+name}).length).toBeGreaterThan(0);
 for(const label of ['General Practice','Dermatology','Pediatrics','Mental Health']){await press(label);expect(navigation.navigate).toHaveBeenLastCalledWith('Doctors',{search:label});}
 await press('My prescriptions');expect(navigation.navigate).toHaveBeenLastCalledWith('Prescriptions');await press('Notifications');expect(navigation.navigate).toHaveBeenLastCalledWith('Notifications');
 expect(tree.root.findAllByProps({testID:'unread-notification-dot'})).toHaveLength(0);
});
test('real appointment renders approved doctor details and eligible Join; future appointment cannot join',async()=>{
 await render(PatientHomeScreen);await act(async()=>mockNext([row()]));expect(JSON.stringify(tree.toJSON())).toContain('Dr Real');await press('Join');expect(navigation.navigate).toHaveBeenCalledWith('Consultation',{appointmentId:id});
 await act(async()=>mockNext([{...row(),startAt:Date.now()+3600000,endAt:Date.now()+5400000}]));expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Join').props.disabled).toBe(true);
 navigation.navigate.mockClear();await press('Join');expect(navigation.navigate).not.toHaveBeenCalled();
});
test('appointment errors offer retry and only observed unread notifications show a dot',async()=>{
 mockInbox.list.mockResolvedValue({items:[{read:false}],nextCursor:null});await render(PatientHomeScreen);expect(tree.root.findAllByProps({testID:'unread-notification-dot'}).length).toBeGreaterThan(0);
 await act(async()=>mockError());expect(JSON.stringify(tree.toJSON())).toContain('Unable to load appointments');await press('Retry');expect(mockStop).toHaveBeenCalled();
 await act(async()=>tree.unmount());tree=null;expect(mockInbox.dispose).toHaveBeenCalled();
});

test('refined home keeps large specialty icons and a compact actionable empty state',async()=>{
 await render(PatientHomeScreen);await act(async()=>mockNext([]));
 const {PatientIcon}=require('../src/ui/PatientIcon');
 for(const name of ['stethoscope','skin','baby','brain']){
  const icon=tree.root.findAllByType(PatientIcon).find(n=>n.props.name===name&&n.props.size>28);
  expect(icon.props.size).toBeGreaterThan(32);expect(icon.props.size).toBeLessThanOrEqual(44);
 }
 expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Join')).toBe(false);
 await press('Find a doctor');expect(navigation.navigate).toHaveBeenLastCalledWith('Doctors');
});

test('banner image has explicit proportional dimensions rather than intrinsic PNG height',async()=>{
 await render(PatientHomeScreen);
 const image=tree.root.findByProps({testID:'consult-doctor-image'});
 expect(typeof image.props.style.width).toBe('number');expect(typeof image.props.style.height).toBe('number');
 expect(image.props.style.width/image.props.style.height).toBeCloseTo(1312/1199);
 expect(image.props.style.height).toBeLessThan(200);expect(image.props.resizeMode).toBe('contain');
 expect(tree.root.findByProps({testID:'consult-doctor-artwork'}).props.style.overflow).toBe('hidden');
 await press('Consult a doctor');expect(navigation.navigate).toHaveBeenLastCalledWith('Doctors');
});

test('directory distinguishes empty, filtered and loading states and supports filter panel and back',async()=>{
 await render(DoctorsScreen);expect(JSON.stringify(tree.toJSON())).toContain('No approved doctors available');
 await press('Filter specialties');expect(JSON.stringify(tree.toJSON())).toContain('Specialty filters appear when doctors are loaded');
 await press('Done');await press('Back');expect(navigation.goBack).toHaveBeenCalled();
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Search by name or specialty'}).props.onChangeText('none'));
 expect(JSON.stringify(tree.toJSON())).toContain('No matching doctors');await press('Clear filters');
 expect(JSON.stringify(tree.toJSON())).toContain('No approved doctors available');
});
test('directory preserves incoming specialty and shows honest unavailable metadata',async()=>{
 mockSession.listDoctors.mockResolvedValue({items:[{uid:'d',professionalName:'Dr Real',specialty:'Dermatology'}],nextCursor:null});
 await render(DoctorsScreen,{route:{params:{specialty:'Dermatology'}}});
 expect(JSON.stringify(tree.toJSON())).toContain('Ratings unavailable');expect(JSON.stringify(tree.toJSON())).not.toContain('Available today');
 expect(mockSession.times).not.toHaveBeenCalled();
 await press('View doctor: Dr Real');expect(navigation.navigate).toHaveBeenCalledWith('DoctorProfile',{doctorId:'d'});
});
test('pending directory shows loading instead of an empty state',async()=>{
 mockSession.listDoctors.mockReturnValue(new Promise(()=>{}));await render(DoctorsScreen);
 expect(JSON.stringify(tree.toJSON())).toContain('Loading doctors');expect(JSON.stringify(tree.toJSON())).not.toContain('No approved doctors available');
});

async function expandAppointment(){await act(async()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityHint==='Show appointment details and available actions')[0].props.onPress());}
test('appointment tabs and refresh preserve query mode and exclusive empty states',async()=>{
 const {readAppointmentPage}=require('../src/services/appointmentReads');
 await render(PatientAppointments);expect(JSON.stringify(tree.toJSON())).toContain('No upcoming appointments');
 await press('Appointment History');expect(JSON.stringify(tree.toJSON())).toContain('No appointment history yet');
 expect(readAppointmentPage.mock.calls.at(-1)[2]).toBe('history');
 await press('Refresh appointments');expect(readAppointmentPage).toHaveBeenCalledTimes(3);
 await press('Find a doctor');expect(navigation.navigate).toHaveBeenCalledWith('Doctors');
});
test.each([['scheduled','Scheduled'],['completed','Completed'],['cancelled','Cancelled'],['no_show','No-show']])('appointment card retains real %s status and excludes empty state',async(status,label)=>{
 require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[{...row(),status}],cursor:null});
 await render(PatientAppointments);const json=JSON.stringify(tree.toJSON());expect(json).toContain(label);expect(json).toContain('Dr Real');expect(json).not.toContain('No upcoming appointments');
 await expandAppointment();
 if(status==='completed'){await press('Rate or view my rating');expect(navigation.navigate).toHaveBeenCalledWith('RateDoctor',{consultationId:id});}
});
test('unavailable doctor profile keeps appointment and authorized avatar fallback',async()=>{
 getPatientDoctor.mockRejectedValue(new Error('unavailable'));
 require('../src/services/appointmentReads').readAppointmentPage.mockResolvedValue({rows:[row()],cursor:null});
 await render(PatientAppointments);expect(JSON.stringify(tree.toJSON())).toContain('Doctor details unavailable');
 expect(tree.root.findByType('Avatar').props).toMatchObject({name:'Doctor',uid:'d'});
 await expandAppointment();await press('Open consultation');expect(navigation.navigate).toHaveBeenCalledWith('Consultation',{appointmentId:id});
});
test('appointment loading failure does not show empty state and refresh recovers',async()=>{
 require('../src/services/appointmentReads').readAppointmentPage.mockRejectedValueOnce(Error('offline')).mockResolvedValue({rows:[],cursor:null});
 await render(PatientAppointments);expect(JSON.stringify(tree.toJSON())).toContain('Unable to load appointments');expect(JSON.stringify(tree.toJSON())).not.toContain('No upcoming appointments');
 await press('Refresh appointments');expect(JSON.stringify(tree.toJSON())).toContain('No upcoming appointments');
});
