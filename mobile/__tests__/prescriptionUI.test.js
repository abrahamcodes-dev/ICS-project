const React=require('react'),{act,create}=require('react-test-renderer');
const {Action,Field}=require('../src/ui/design');
const mockGet=jest.fn(),mockIssue=jest.fn(),mockDispose=jest.fn();let mockIdentity,mockAppointment,mockAcademic=false;
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:'ready',firebaseUid:'doctor',user:{status:'active',role:'doctor'}})}));
jest.mock('../src/services/appointmentReads',()=>({readAppointmentPage:jest.fn(),observeAppointment:jest.fn((uid,role,id,next)=>{mockAppointment=next;return jest.fn();})}));
jest.mock('../src/services/academicDemo',()=>({isHostedAcademicDemo:()=>mockAcademic}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
jest.mock('../src/services/prescriptionService',()=>({
 createPrescriptionSession:()=>({get:mockGet,issue:mockIssue,dispose:mockDispose}),
 validateMedication:med=>{if(Object.values(med).some(v=>!v.trim()))throw Error('required');return med;},
}));
const {PrescriptionRecord}=require('../src/screens/shared/PrescriptionWorkspace');
let tree;
async function render(doctor=true){await act(async()=>{tree=create(<PrescriptionRecord uid={doctor?'doctor':'patient'} cid={'a'.repeat(64)} doctor={doctor}/>);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(x=>x.props.title===title).props.onPress());}
async function fill(){await press('+ Add medication');await act(async()=>tree.root.findAllByType(Field).filter(f=>f.props.editable!==false).forEach(f=>f.props.onChangeText('Synthetic entry')));}
const text=()=>JSON.stringify(tree.toJSON());
beforeEach(()=>{jest.clearAllMocks();mockAcademic=false;mockGet.mockReset().mockResolvedValue(null);mockIssue.mockReset();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('patient sees empty state without prescribing controls',async()=>{await render(false);expect(text()).toContain('No prescription');expect(tree.root.findAllByType(Field)).toHaveLength(0);});

test('patient sees only the appointment-bound verified professional name, not the raw audit UID',async()=>{
 const record={doctorId:'private-doctor-uid',issuedAt:123,medications:[{name:'Original clinical text'}]};
 mockGet.mockResolvedValue(record);await render(false);
 await act(async()=>mockAppointment({doctorId:'private-doctor-uid',doctorDisplay:{professionalName:'Dr Synthetic Professional',specialty:'General Practitioner'}}));
 expect(text()).toContain('Dr Synthetic Professional');expect(text()).not.toContain('private-doctor-uid');expect(text()).toContain('Original clinical text');
 await act(async()=>mockAppointment({doctorId:'other-doctor',doctorDisplay:{professionalName:'Wrong Doctor'}}));
 expect(text()).not.toContain('Wrong Doctor');expect(text()).toContain('Verified doctor name unavailable');expect(record.doctorId).toBe('private-doctor-uid');
});

test('academic synthetic warning is display-only and localizes without translating prescribed content',async()=>{
 mockAcademic=true;mockGet.mockResolvedValue({doctorId:'doctor',issuedAt:123,medications:[{name:'Original medication'}]});await render(false);
 expect(text()).toContain('NOT A VALID PRESCRIPTION');
 const {setLanguage}=require('../src/i18n/locale');
 try{await act(async()=>setLanguage('sw'));expect(text()).toContain('SI AGIZO HALALI LA DAWA');expect(text()).toContain('Original medication');}
 finally{await act(async()=>setLanguage('en'));}
});
test('validates and requires explicit confirmation',async()=>{
 await render();await press('Send prescription');expect(text()).toContain('Add at least one');
 await fill();await press('Send prescription');expect(mockIssue).not.toHaveBeenCalled();
 mockIssue.mockResolvedValue({doctorId:'doctor',issuedAt:123,medications:[{name:'Synthetic'}]});await press('Confirm issuance');
 expect(mockIssue).toHaveBeenCalledTimes(1);expect(text()).toContain('Immutable issued record');
});
test('uncertain result freezes content and retries unchanged',async()=>{
 await render();await fill();await press('Send prescription');mockIssue.mockRejectedValue(Error('offline'));await press('Confirm issuance');
 expect(text()).toContain('Issuance not confirmed');expect(tree.root.findAllByType(Field).every(f=>!f.props.editable)).toBe(true);
 await press('Retry unchanged prescription');expect(mockIssue.mock.calls[0][0]).toEqual(mockIssue.mock.calls[1][0]);
});
test('read errors show retry without exposing issuance',async()=>{
 mockGet.mockRejectedValue(Error('denied'));await render();expect(text()).toContain('Unable to retrieve');expect(tree.root.findAllByType(Field)).toHaveLength(0);
 mockGet.mockResolvedValue(null);await press('Retrieve prescription');expect(text()).toContain('Medication');
});
test('identity change clears sensitive content and ignores late issuance',async()=>{
 let resolve;await render();await fill();await press('Send prescription');mockIssue.mockReturnValue(new Promise(r=>{resolve=r;}));await press('Confirm issuance');
 await act(async()=>mockIdentity());await act(async()=>resolve({doctorId:'doctor',issuedAt:123,medications:[{name:'private'}]}));
 expect(text()).not.toContain('private');expect(text()).not.toContain('Synthetic');expect(mockDispose).toHaveBeenCalled();
});
test('teardown ignores delayed retrieval',async()=>{
 let resolve;mockGet.mockReturnValue(new Promise(r=>{resolve=r;}));await render();await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve(null));expect(mockDispose).toHaveBeenCalled();
});
test('prescription selection appears only after completed status is returned on refresh',async()=>{
 const {readAppointmentPage}=require('../src/services/appointmentReads');
 const Workspace=require('../src/screens/shared/PrescriptionWorkspace').default;
 const row={appointmentId:'a'.repeat(64),doctorId:'doctor',patientId:'patient',startAt:1,endAt:2,status:'scheduled'};
 readAppointmentPage.mockResolvedValue({rows:[row],cursor:null});
 await act(async()=>{tree=create(<Workspace/>);});
 expect(tree.root.findAllByType(Action).some(a=>a.props.title==='View consultation prescription')).toBe(false);
 readAppointmentPage.mockResolvedValue({rows:[{...row,status:'completed'}],cursor:null});
 await press('Refresh appointments');
 await press('View consultation prescription');
 expect(mockGet).toHaveBeenCalledTimes(1);
});
test('empty form, unsupported controls, adding editing and removing medications',async()=>{
 await render();expect(tree.root.findAllByType(Field).filter(f=>f.props.editable!==false)).toHaveLength(0);
 expect(tree.root.findAllByType(Field).find(f=>f.props.label==='Additional instructions').props.editable).toBe(false);
 expect(tree.root.findAllByType(Action).find(a=>a.props.title==='Upload file').props.disabled).toBe(true);
 await press('+ Add medication');await press('+ Add medication');expect(tree.root.findAllByType(Field).filter(f=>f.props.editable!==false)).toHaveLength(10);
 await act(async()=>tree.root.findAllByType(Field).find(f=>f.props.label==='Medication 2 name').props.onChangeText('Second entry'));
 await press('Remove medication 1');expect(tree.root.findAllByType(Field).find(f=>f.props.label==='Medication 1 name').props.value).toBe('Second entry');
 await press('Remove medication 1');expect(tree.root.findAllByType(Field).filter(f=>f.props.editable!==false)).toHaveLength(0);
});
test('submission shows progress, blocks duplicates and only shows success after server response',async()=>{
 await render();await fill();await press('Send prescription');let resolve;mockIssue.mockReturnValue(new Promise(r=>resolve=r));const submit=tree.root.findAllByType(Action).find(a=>a.props.title==='Confirm issuance');
 await act(async()=>{submit.props.onPress();submit.props.onPress();});expect(mockIssue).toHaveBeenCalledTimes(1);expect(text()).toContain('Submitting...');expect(text()).not.toContain('Issued prescription');
 await act(async()=>resolve({doctorId:'doctor',issuedAt:123,medications:[{name:'Synthetic'}]}));expect(text()).toContain('Issued prescription');
});
