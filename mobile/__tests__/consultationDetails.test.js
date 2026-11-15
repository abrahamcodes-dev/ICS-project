const React=require('react'),{create,act}=require('react-test-renderer');
let mockNext,mockError;
const mockCancel=jest.fn(),mockStop=jest.fn(),mockRead=jest.fn();
const mockSession={cancel:mockCancel};
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active',verificationStatus:'approved'}})}));
jest.mock('../src/hooks/useSchedulingSession',()=>({useSchedulingSession:()=>mockSession}));
jest.mock('../src/services/schedulingService',()=>({schedulingError:()=> 'Cancellation not confirmed. Reload and retry.'}));
jest.mock('../src/services/avatarService',()=>({createAvatarSession:()=>({readAppointmentPatient:mockRead,dispose:jest.fn()})}));
jest.mock('../src/services/firebaseConfig',()=>({db:{}}));jest.mock('firebase/firestore',()=>({}));
jest.mock('../src/services/appointmentReads',()=>({...jest.requireActual('../src/services/appointmentReads'),observeAppointment:jest.fn((uid,role,id,next,error)=>{mockNext=next;mockError=error;return mockStop;})}));
const {ConsultationDetails,canCancel}=require('../src/screens/doctor/ConsultationDetailsScreen');
const {Action}=require('../src/ui/design');
const id='a'.repeat(64),join=jest.fn(),back=jest.fn();let tree;
const row=(offset=3600000,status='scheduled')=>({appointmentId:id,doctorId:'d',patientId:'p',startAt:Date.now()+offset,endAt:Date.now()+offset+1800000,status});
beforeEach(()=>{jest.clearAllMocks();mockRead.mockResolvedValue({appointmentId:id,patientDisplayName:'Ada Patient',patientAvatar:null});mockCancel.mockResolvedValue({status:'cancelled'});});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
async function render(a){await act(async()=>{tree=create(<ConsultationDetails uid="d" id={id} back={back} join={join}/>);});if(a)await act(async()=>mockNext(a));}
const action=title=>tree.root.findAllByType(Action).find(n=>n.props.title===title);
async function press(label){await act(async()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===label)[0].props.onPress());}
test('loading, real name, initials, duration, timezone and future gate',async()=>{await render();expect(JSON.stringify(tree.toJSON())).toContain('Loading consultation');await act(async()=>mockNext(row()));const text=JSON.stringify(tree.toJSON());expect(text).toContain('Ada Patient');expect(text).toContain('AP');expect(text).toContain('30 minutes');expect(text).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);expect(action('Join consultation').props.disabled).toBe(true);await act(async()=>action('Join consultation').props.onPress());expect(join).not.toHaveBeenCalled();await press('Back');expect(back).toHaveBeenCalled();});
test('eligible joins, expired and cancelled never join',async()=>{await render(row(-1000));await act(async()=>action('Join consultation').props.onPress());expect(join).toHaveBeenCalledTimes(1);await act(async()=>mockNext(row(-3600000)));expect(action('Join consultation').props.disabled).toBe(true);await act(async()=>mockNext(row(-1000,'cancelled')));expect(action('Join consultation').props.disabled).toBe(true);});
test('confirmation prevents duplicate cancellation and refreshes on success',async()=>{await render(row());await press('Cancel appointment');expect(mockCancel).not.toHaveBeenCalled();let finish;mockCancel.mockReturnValue(new Promise(r=>finish=r));await act(async()=>{action('Confirm cancellation').props.onPress();action('Confirm cancellation').props.onPress();});expect(mockCancel).toHaveBeenCalledTimes(1);await act(async()=>finish({status:'cancelled'}));expect(JSON.stringify(tree.toJSON())).toContain('Appointment cancelled.');expect(mockStop).toHaveBeenCalled();});
test('cancel failure reports uncertainty and reloads authoritative state',async()=>{mockCancel.mockRejectedValue(Error('offline'));await render(row());await press('Cancel appointment');await act(async()=>action('Confirm cancellation').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Cancellation not confirmed');expect(mockStop).toHaveBeenCalled();});
test('cancellation restricted by owner status and start time',()=>{expect(canCancel(row(),'other',Date.now())).toBe(false);expect(canCancel(row(1000,'completed'),'d',Date.now())).toBe(false);expect(canCancel(row(-1000),'d',Date.now())).toBe(false);});
test('missing profile falls back and unavailable private information is explicit',async()=>{mockRead.mockRejectedValue(Error('denied'));await render(row());expect(JSON.stringify(tree.toJSON())).toContain('Patient');await press('Patient information');expect(JSON.stringify(tree.toJSON())).toContain('medical information is not available');await press('Previous consultations');expect(JSON.stringify(tree.toJSON())).toContain('history is not available');await act(async()=>mockError());expect(JSON.stringify(tree.toJSON())).toContain('Appointment unavailable');expect(action('Join consultation')).toBeUndefined();});
