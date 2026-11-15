const React=require('react'),{create,act}=require('react-test-renderer'),{Image}=require('react-native');
let mockInvalidate;
const mockRead=jest.fn(),mockDispose=jest.fn();
jest.mock('../src/services/avatarService',()=>({createAvatarSession:jest.fn((uid,onInvalidated)=>{mockInvalidate=onInvalidated;return{readAppointmentPatient:mockRead,dispose:mockDispose};})}));
const {useAppointmentPatients}=require('../src/hooks/useAppointmentPatients');
const {AppointmentPatient}=require('../src/components/AppointmentPatient');
const id='a'.repeat(64),other='b'.repeat(64),photo='data:image/jpeg;base64,YQ==';
const row=(appointmentId=id)=>({appointmentId,patientId:'patient'});
function Harness({uid='doctor',rows=[row()]}){const patients=useAppointmentPatients(uid,rows);return <AppointmentPatient display={patients[rows[0]?.appointmentId]}/>;}
let tree;
beforeEach(()=>{jest.clearAllMocks();mockRead.mockImplementation(async appointmentId=>({appointmentId,patientDisplayName:'Ada Patient',patientAvatar:photo}));});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
async function render(node){await act(async()=>{tree=create(node);});}
test('name and image rendered; repeated renders and same patient use one request',async()=>{
 await render(<Harness rows={[row(),row(other)]}/>);expect(tree.root.findByType(Image).props.source.uri).toBe(photo);
 expect(JSON.stringify(tree.toJSON())).toContain('Ada Patient');expect(mockRead).toHaveBeenCalledTimes(1);
 await act(async()=>tree.update(<Harness rows={[row(),row(other)]}/>));expect(mockRead).toHaveBeenCalledTimes(1);
});
test('missing image and failed image use initials',async()=>{
 await render(<Harness/>);await act(async()=>tree.root.findByType(Image).props.onError());
 expect(JSON.stringify(tree.toJSON())).toContain('AP');expect(tree.root.findAllByType(Image)).toHaveLength(0);
});
test('missing display or retrieval failure uses neutral fallback',async()=>{
 mockRead.mockRejectedValue(Error('denied'));await render(<Harness/>);
 expect(JSON.stringify(tree.toJSON())).toContain('Patient');expect(tree.root.findAllByType(Image)).toHaveLength(0);
});
test('null optional values use fallback',async()=>{
 mockRead.mockResolvedValue({appointmentId:id,patientDisplayName:null,patientAvatar:null});await render(<Harness/>);
 expect(JSON.stringify(tree.toJSON())).toContain('Patient');expect(tree.root.findAllByType(Image)).toHaveLength(0);
});
test('account switch and late result cannot show previous patient',async()=>{
 let resolve;mockRead.mockReturnValueOnce(new Promise(r=>resolve=r));await render(<Harness/>);
 mockRead.mockRejectedValue(Error('unavailable'));await act(async()=>tree.update(<Harness uid="other"/>));
 await act(async()=>resolve({appointmentId:id,patientDisplayName:'Old Private Name',patientAvatar:photo}));
 expect(JSON.stringify(tree.toJSON())).not.toContain('Old Private Name');expect(tree.root.findAllByType(Image)).toHaveLength(0);expect(mockDispose).toHaveBeenCalled();
});
test('identity invalidation clears displayed image immediately',async()=>{
 await render(<Harness/>);await act(async()=>mockInvalidate());
 expect(tree.root.findAllByType(Image)).toHaveLength(0);expect(JSON.stringify(tree.toJSON())).not.toContain('Ada Patient');
});
