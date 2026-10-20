const React=require('react'),{act,create}=require('react-test-renderer');
const {Action,Field}=require('../src/ui/design');
const mockGet=jest.fn(),mockIssue=jest.fn(),mockDispose=jest.fn();let mockIdentity;
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:'ready',firebaseUid:'doctor',user:{status:'active',role:'doctor'}})}));
jest.mock('../src/services/appointmentReads',()=>({readAppointmentPage:jest.fn()}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
jest.mock('../src/services/prescriptionService',()=>({
 createPrescriptionSession:()=>({get:mockGet,issue:mockIssue,dispose:mockDispose}),
 validateMedication:med=>{if(Object.values(med).some(v=>!v.trim()))throw Error('required');return med;},
}));
const {PrescriptionRecord}=require('../src/screens/shared/PrescriptionWorkspace');
let tree;
async function render(doctor=true){await act(async()=>{tree=create(<PrescriptionRecord uid={doctor?'doctor':'patient'} cid={'a'.repeat(64)} doctor={doctor}/>);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(x=>x.props.title===title).props.onPress());}
async function fill(){await act(async()=>tree.root.findAllByType(Field).forEach(f=>f.props.onChangeText('Synthetic entry')));}
const text=()=>JSON.stringify(tree.toJSON());
beforeEach(()=>{jest.clearAllMocks();mockGet.mockReset().mockResolvedValue(null);mockIssue.mockReset();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('patient sees empty state without prescribing controls',async()=>{await render(false);expect(text()).toContain('No prescription');expect(tree.root.findAllByType(Field)).toHaveLength(0);});
test('validates and requires explicit confirmation',async()=>{
 await render();await press('Review prescription');expect(text()).toContain('Complete all');
 await fill();await press('Review prescription');expect(mockIssue).not.toHaveBeenCalled();
 mockIssue.mockResolvedValue({doctorId:'doctor',issuedAt:123,medications:[{name:'Synthetic'}]});await press('Confirm issuance');
 expect(mockIssue).toHaveBeenCalledTimes(1);expect(text()).toContain('Immutable issued record');
});
test('uncertain result freezes content and retries unchanged',async()=>{
 await render();await fill();await press('Review prescription');mockIssue.mockRejectedValue(Error('offline'));await press('Confirm issuance');
 expect(text()).toContain('Issuance not confirmed');expect(tree.root.findAllByType(Field).every(f=>!f.props.editable)).toBe(true);
 await press('Retry unchanged prescription');expect(mockIssue.mock.calls[0][0]).toEqual(mockIssue.mock.calls[1][0]);
});
test('read errors show retry without exposing issuance',async()=>{
 mockGet.mockRejectedValue(Error('denied'));await render();expect(text()).toContain('Unable to retrieve');expect(tree.root.findAllByType(Field)).toHaveLength(0);
 mockGet.mockResolvedValue(null);await press('Retrieve prescription');expect(text()).toContain('No prescription');
});
test('identity change clears sensitive content and ignores late issuance',async()=>{
 let resolve;await render();await fill();await press('Review prescription');mockIssue.mockReturnValue(new Promise(r=>{resolve=r;}));await press('Confirm issuance');
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
