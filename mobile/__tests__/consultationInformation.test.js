const React=require('react'),{act,create}=require('react-test-renderer');
const {Action}=require('../src/ui/design');
const mockRead=jest.fn(),mockDispose=jest.fn(),mockOlder=jest.fn();let mockIdentity,mockRows,mockError;
jest.mock('../src/services/avatarService',()=>({createAvatarSession:()=>({readAppointmentPatient:mockRead,dispose:mockDispose})}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
jest.mock('../src/services/consultationService',()=>({createConsultationMessageSession:()=>({start:(_,next,error)=>{mockRows=next;mockError=error;next([]);},loadOlder:mockOlder,dispose:mockDispose})}));
jest.mock('../src/screens/shared/ConsultationAttachments',()=>({ConsultationAttachmentViewer:()=>null}));
const {ConsultationPatientSummary,ConsultationDocuments}=require('../src/screens/doctor/ConsultationInformation');
const room={consultationId:'a'.repeat(64),appointmentId:'a'.repeat(64),patientId:'p',doctorId:'d'};
let tree;const text=()=>JSON.stringify(tree.toJSON());
beforeEach(()=>{jest.clearAllMocks();mockRead.mockResolvedValue({appointmentId:room.appointmentId,patientDisplayName:'Synthetic Patient',patientAvatar:null});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('summary uses appointment display only and explicitly restricts optional medical records',async()=>{
 await act(async()=>{tree=create(<ConsultationPatientSummary uid="d" room={room}/>);});
 expect(mockRead).toHaveBeenCalledWith(room.appointmentId);expect(text()).toContain('Synthetic Patient');expect(text()).toContain('Restricted.');
 await act(async()=>mockIdentity());expect(text()).not.toContain('Synthetic Patient');expect(mockDispose).toHaveBeenCalled();
});
test('unassigned actor cannot request a patient summary',async()=>{
 await act(async()=>{tree=create(<ConsultationPatientSummary uid="other" room={room}/>);});expect(mockRead).not.toHaveBeenCalled();expect(text()).toContain('Unable to load');
});
test('denied summary never displays stale identity and offers retry',async()=>{
 mockRead.mockRejectedValue(Error('denied'));await act(async()=>{tree=create(<ConsultationPatientSummary uid="d" room={room}/>);});expect(text()).not.toContain('Synthetic Patient');expect(tree.root.findByType(Action).props.title).toBe('Retry');
});
test('documents show only bound finalized doctor attachments, never unrelated or patient records',async()=>{
 await act(async()=>{tree=create(<ConsultationDocuments uid="d" room={room}/>);});
 const attachment={attachmentId:'b'.repeat(64),consultationId:room.consultationId,senderId:'d',filename:'Synthetic report.pdf',status:'finalized'};
 const row={messageId:'b'.repeat(64),senderId:'d',type:'attachment',attachment,createdAt:1,createdAtTimestamp:{seconds:0,nanoseconds:1}};
 await act(async()=>mockRows([row,{...row,messageId:'c',attachment:{...attachment,consultationId:'other',filename:'foreign.pdf'}},{...row,messageId:'p',senderId:'p',attachment:{...attachment,senderId:'p',filename:'optional patient record.pdf'}}]));
 expect(text()).toContain('Synthetic report.pdf');expect(text()).not.toContain('foreign.pdf');expect(text()).not.toContain('optional patient record.pdf');
 const viewer=require('../src/screens/shared/ConsultationAttachments').ConsultationAttachmentViewer;
 await act(async()=>tree.root.findAllByType(Action).find(a=>a.props.title==='View private document').props.onPress());expect(tree.root.findByType(viewer).props.attachment).toEqual(attachment);
 await act(async()=>mockIdentity());expect(text()).not.toContain('Synthetic report');expect(tree.root.findAllByType(viewer)).toHaveLength(0);
});
test('history denial clears document metadata; older reads preserve the exact cursor',async()=>{
 await act(async()=>{tree=create(<ConsultationDocuments uid="d" room={room}/>);});
 const rows=Array.from({length:30},(_,i)=>({messageId:String(i).padStart(64,'0'),senderId:'d',type:'text',createdAt:i,createdAtTimestamp:{seconds:0,nanoseconds:i}}));
 await act(async()=>mockRows(rows));mockOlder.mockResolvedValue({messages:[]});await act(async()=>tree.root.findByType(Action).props.onPress());
 expect(mockOlder).toHaveBeenCalledWith({createdAt:rows[0].createdAtTimestamp,messageId:rows[0].messageId});
 await act(async()=>mockError(Error('denied')));expect(text()).toContain('Unable to load');expect(text()).not.toContain('No consultation attachments');
});
test('documents wait for the listener before declaring the loaded page empty',async()=>{
 await act(async()=>{tree=create(<ConsultationDocuments uid="d" room={room}/>);});expect(text()).not.toContain('No consultation attachments');
 await act(async()=>mockRows([]));expect(text()).toContain('No consultation attachments');
});
