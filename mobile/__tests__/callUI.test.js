const React = require('react');
const {act, create} = require('react-test-renderer');
const {Action:Button} = require('../src/ui/design');
let mockState, mockNext;
const mockSession = {start:jest.fn(),accept:jest.fn(),end:jest.fn(),dispose:jest.fn(),load:jest.fn()};
const mockMedia = {acquire:jest.fn(),clear:jest.fn(),microphone:jest.fn(),camera:jest.fn(),switchCamera:jest.fn()};
const mockStop = jest.fn();
jest.mock('../src/hooks/useConsultationCall',()=>({useConsultationCall:()=>({session:mockSession,state:mockState})}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({status:'ready',firebaseUid:'p',user:{status:'active',role:'patient'}})}));
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/services/consultationService',()=>({openConsultation:jest.fn()}));
jest.mock('../src/screens/shared/ConsultationChat',()=>jest.fn(()=>null));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:jest.fn(()=>jest.fn())}));
jest.mock('../src/services/calls/discovery',()=>({discoverConsultationCalls:jest.fn((_,next)=>{mockNext=next;return mockStop;})}));
jest.mock('../src/services/calls/media',()=>({...jest.requireActual('../src/services/calls/media'),createCallMedia:()=>mockMedia}));
jest.mock('react-native-webrtc',()=>({RTCView:'RTCView'}));
const {CallRoom,callStatus}=require('../src/screens/shared/ConsultationCallScreen');
const {CallMediaError}=require('../src/services/calls/media');
let tree;
async function render(){await act(async()=>{tree=create(<CallRoom consultationId={'a'.repeat(64)} uid="p" restart={jest.fn()}/>);});}
async function press(title){await act(async()=>{tree.root.findAllByType(Button).find(b=>b.props.title===title).props.onPress();});}
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);mockState={phase:'idle',call:null};mockMedia.acquire.mockResolvedValue({getVideoTracks:()=>[{}],toURL:()=> 'local'});mockMedia.switchCamera.mockReturnValue(true);
 mockSession.start.mockImplementation(async()=>{mockState={phase:'ringing',call:{initiatorId:'p',recipientId:'d',mode:'video'}};});
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('discovery gates outgoing media; controls use existing session and tracks',async()=>{
 await render();expect(tree.root.findAllByType(Button)[0].props.disabled).toBe(true);
 await act(async()=>mockNext(null));await press('Start video call');
 expect(mockMedia.acquire).toHaveBeenCalledWith('video');expect(mockSession.start).toHaveBeenCalledWith('video');
 await press('Mute microphone');expect(mockMedia.microphone).toHaveBeenCalledWith(false);
 await press('Disable camera');expect(mockMedia.camera).toHaveBeenCalledWith(false);
 await press('Enable camera');await press('Switch camera');expect(mockMedia.switchCamera).toHaveBeenCalled();
 expect(mockStop).toHaveBeenCalled();
});
test('incoming accept acquires media before accepting, reject does not capture',async()=>{
 mockState={phase:'ringing',call:{recipientId:'p',mode:'audio'}};await render();await press('Accept call');
 expect(mockMedia.acquire).toHaveBeenCalledWith('audio');expect(mockSession.accept).toHaveBeenCalledTimes(1);
 await press('Reject call');expect(mockSession.end).toHaveBeenCalled();expect(mockMedia.clear).toHaveBeenCalled();
 expect(mockMedia.acquire).toHaveBeenCalledTimes(1);
});
test('denied permissions do not start signaling and offer settings',async()=>{
 mockMedia.acquire.mockRejectedValue(new CallMediaError('permission'));await render();await act(async()=>mockNext(null));
 await press('Start audio call');expect(mockSession.start).not.toHaveBeenCalled();
 expect(tree.root.findAllByType(Button).some(b=>b.props.title==='Open device settings')).toBe(true);
});
test('unmount cancels media and discovery without starting a late acquisition',async()=>{
 let resolve;mockMedia.acquire.mockReturnValue(new Promise(r=>{resolve=r;}));await render();await act(async()=>mockNext(null));
 await press('Start audio call');await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve({getVideoTracks:()=>[]}));expect(mockSession.start).not.toHaveBeenCalled();
 expect(mockMedia.clear).toHaveBeenCalled();expect(mockStop).toHaveBeenCalled();
});
test.each([['connecting',null,'Connecting'],['ringing',null,'Ringing'],['connected',null,'Connected'],['ended','rejected','Rejected'],['ended','expired','Expired'],['ended',null,'Ended'],['error',null,'Failed']])('labels %s / %s', (phase,endReason,label)=>{
 expect(callStatus({phase,call:endReason?{endReason}:null})).toBe(label);
});

test('authorized closed consultation renders history without call resources',async()=>{
 const id='a'.repeat(64),room={consultationId:id,patientId:'p',doctorId:'d',state:'closed',canSend:false};
 require('../src/services/consultationService').openConsultation.mockResolvedValue(room);
 const Screen=require('../src/screens/shared/ConsultationCallScreen').default;
 const Chat=require('../src/screens/shared/ConsultationChat');
 await act(async()=>{tree=create(<Screen route={{params:{appointmentId:id}}}/>);});
 expect(tree.root.findByType(Chat).props).toMatchObject({room,uid:'p'});
 expect(tree.root.findAllByType(CallRoom)).toHaveLength(0);
 expect(mockMedia.acquire).not.toHaveBeenCalled();
 expect(require('../src/services/calls/discovery').discoverConsultationCalls).not.toHaveBeenCalled();
});

test.each([{patientId:'other',doctorId:'another'},{consultationId:'b'.repeat(64)},{canSend:true}])('invalid closed room binding is rejected %#',async(extra)=>{
 const id='a'.repeat(64);
 require('../src/services/consultationService').openConsultation.mockResolvedValue({consultationId:id,patientId:'p',doctorId:'d',state:'closed',canSend:false,...extra});
 const Screen=require('../src/screens/shared/ConsultationCallScreen').default;
 await act(async()=>{tree=create(<Screen route={{params:{appointmentId:id}}}/>);});
 expect(tree.root.findAllByType(require('../src/screens/shared/ConsultationChat'))).toHaveLength(0);
 expect(tree.root.findAllByType(CallRoom)).toHaveLength(0);
});
