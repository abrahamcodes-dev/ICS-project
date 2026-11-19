const React=require('react'),{act,create}=require('react-test-renderer');
const {HeaderShownContext}=require('@react-navigation/elements');
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({firebaseUid:'patient'})}));
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>null}));
jest.mock('../src/components/Payments',()=>({FeeDisplay:()=>null}));
jest.mock('../src/components/ProfileAvatar',()=>({ProfileAvatar:()=>null}));
jest.mock('../src/services/patientDoctors',()=>({getPatientDoctor:jest.fn()}));
jest.mock('../src/services/schedulingService',()=>({localDate:()=> '2026-11-19',schedulingError:()=> 'error'}));
jest.mock('../src/screens/patient/PatientMenu',()=>({PatientMenu:()=>null,PatientAvatar:()=>null}));
jest.mock('../src/screens/patient/PatientAppointmentCard',()=>()=>null);
jest.mock('../src/screens/shared/SchedulingAppointments',()=>({__esModule:true,default:({header})=>header(jest.fn(),false)}));
const {PatientAppointments}=require('../src/screens/patient/PatientScheduling');
const {LanguageSwitchButton}=require('../src/i18n/react');
const {setLanguage}=require('../src/i18n/locale');
let tree;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;await setLanguage('en');jest.restoreAllMocks();});
test.each([['en','Upcoming & Active','Appointment History'],['sw','Ijayo na inayoendelea','Historia ya miadi']])('appointment tabs use translated visible and accessible labels in %s',async(language,upcoming,history)=>{
 jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 await setLanguage(language);
 await act(async()=>{tree=create(<HeaderShownContext.Provider value={true}><PatientAppointments navigation={{navigate:jest.fn()}}/></HeaderShownContext.Provider>);});
 const tabs=()=>tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&typeof n.props.onPress==='function');
 expect(tabs().map(n=>n.props.accessibilityLabel)).toEqual([upcoming,history]);
 expect(JSON.stringify(tree.toJSON())).toContain(upcoming);expect(JSON.stringify(tree.toJSON())).toContain(history);
 expect(tabs()[0].props.accessibilityState.selected).toBe(true);
 await act(async()=>tabs()[1].props.onPress());expect(tabs()[1].props.accessibilityState.selected).toBe(true);
 expect(tree.root.findAllByType(LanguageSwitchButton)).toHaveLength(0); // Native header owns the sole switcher.
});
test('Appointments enables the existing native headerRight switcher instead of hiding its header',()=>{
 const source=require('fs').readFileSync(require('path').join(__dirname,'../src/navigation/PatientNavigator.tsx'),'utf8');
 expect(source).toMatch(/name="Appointments" component={PatientAppointments} options={{headerShown:true}}/);
 expect(source).toContain('headerRight:()=> <LanguageSwitchButton/>');
});
