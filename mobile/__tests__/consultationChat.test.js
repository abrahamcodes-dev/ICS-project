const React = require('react');
jest.mock('@react-navigation/native',()=>({useNavigation:()=>({navigate:jest.fn()})}));
const {act, create} = require('react-test-renderer');
const {Action, Field} = require('../src/ui/design');
let mockRows, mockError, mockIdentity;
const mockSend = jest.fn();
const mockDispose = jest.fn();
const mockOlder = jest.fn();
const mockView = jest.fn(),mockAttachmentSession=jest.fn();
jest.mock('../src/services/consultationAttachments',()=>({...jest.requireActual('../src/services/consultationAttachments'),
  createAttachmentSession:(...args)=>{mockAttachmentSession(...args);return {view:mockView,dispose:jest.fn()};}}));
jest.mock('../src/services/authService', () => ({onIdentityRefresh: fn => {mockIdentity=fn; return jest.fn();}}));
jest.mock('../src/services/consultationService', () => ({
  sendConsultationMessage: input => mockSend({...input}),
  createConsultationMessageSession: () => ({dispose:mockDispose,loadOlder:mockOlder,start:(_,rows,error)=>{mockRows=rows;mockError=error;rows([]);}}),
}));
const Chat = require('../src/screens/shared/ConsultationChat').default;
const room = {consultationId:'a'.repeat(64),patientId:'p',doctorId:'d',canSend:true};
let tree;
async function render(){await act(async()=>{tree=create(<Chat room={room} uid="p"/>);});}
async function press(title){await act(async()=>{tree.root.findAllByType(Action).find(a=>a.props.title===title).props.onPress();});}
async function draft(text='Hello'){await act(async()=>tree.root.findByType(Field).props.onChangeText(text));}
const content=()=>JSON.stringify(tree.toJSON());
const row=(id,time)=>({messageId:id,senderId:id==='new'?'d':'p',text:id,createdAt:time,createdAtTimestamp:{seconds:time,nanoseconds:123}});
beforeEach(()=>{jest.clearAllMocks(); mockSend.mockReset();mockOlder.mockReset();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('chronological participant labels and precise older cursor',async()=>{
 await render();await act(async()=>mockRows([row('new',2000),row('old',1000)]));
 expect(content().indexOf('old')).toBeLessThan(content().indexOf('new'));
 expect(content()).toContain('Doctor');expect(content()).toContain('You');
 mockOlder.mockResolvedValue({messages:[]});await press('Load older messages');
 expect(mockOlder).toHaveBeenCalledWith({createdAt:{seconds:1000,nanoseconds:123},messageId:'old'});
 expect(tree.root.findAllByType(Action).some(a=>a.props.title==='Load older messages')).toBe(false);
});
test('uncertain send freezes text and retries identical request; acknowledgment clears draft',async()=>{
 await render();await draft();mockSend.mockRejectedValueOnce(new Error('offline'));await press('Send message');
 expect(content()).toContain('Send not confirmed');expect(tree.root.findByType(Field).props.editable).toBe(false);
 mockSend.mockResolvedValue({consultationId:room.consultationId,senderId:'p',type:'text'});await press('Retry same message');
 expect(mockSend.mock.calls[1][0]).toEqual(mockSend.mock.calls[0][0]);
 expect(tree.root.findByType(Field).props.value).toBe('');
});
test('rapid duplicate presses cannot create multiple submissions',async()=>{
 await render();await draft();mockSend.mockReturnValue(new Promise(()=>{}));
 const send=tree.root.findAllByType(Action).find(a=>a.props.title==='Send message').props.onPress;
 await act(async()=>{send();send();});expect(mockSend).toHaveBeenCalledTimes(1);
});
test('identity change empties private state and ignores late send and listener callbacks',async()=>{
 let resolve;await render();await draft();await act(async()=>mockRows([row('private text',1000)]));
 mockSend.mockReturnValue(new Promise(r=>{resolve=r;}));await press('Send message');
 await act(async()=>mockIdentity());
 await act(async()=>{mockRows([row('late private',2000)]);resolve({consultationId:room.consultationId,senderId:'p',type:'text'});});
 expect(content()).not.toContain('private');expect(content()).not.toContain('acknowledged');expect(mockDispose).toHaveBeenCalled();
});
test('unmount disposes session and safely ignores late results',async()=>{
 let resolve;await render();await draft();mockSend.mockReturnValue(new Promise(r=>{resolve=r;}));await press('Send message');
 await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve({consultationId:room.consultationId,senderId:'p',type:'text'}));expect(mockDispose).toHaveBeenCalledTimes(1);
});
test('history errors offer bounded resubscription and empty state',async()=>{
 await render();await act(async()=>mockError(new Error('denied')));expect(content()).toContain('Unable to refresh');
 await press('Retry message history');await act(async()=>mockRows([]));expect(content()).toContain('No messages loaded yet');
});
test('cache reset does not claim an empty synchronized history before the listener responds',async()=>{
 await render();expect(content()).toContain('Loading messages');expect(content()).not.toContain('No messages loaded yet');
 await act(async()=>mockRows([]));expect(content()).toContain('No messages loaded yet');expect(content()).not.toContain('Loading messages');
});
test('successful send is neutral even if history synchronization subsequently fails',async()=>{
 await render();await draft();mockSend.mockResolvedValue({consultationId:room.consultationId,senderId:'p',type:'text'});await press('Send message');
 const {Notice}=require('../src/ui/design');
 expect(content()).toContain('Message sent.');expect(tree.root.findAllByType(Notice).some(n=>n.props.message==='Message sent.')).toBe(false);
 await act(async()=>mockError({code:'unavailable'}));expect(content()).toContain('Your message is saved.');
 expect(content()).not.toContain('Send not confirmed');expect(tree.root.findByType(Field).props.value).toBe('');
});
test('retry listener clears a recovered history error and never disguises access denial as offline',async()=>{
 await render();await act(async()=>mockError({code:'permission-denied'}));expect(content()).toContain('access was denied');
 expect(content()).not.toContain('No messages loaded yet');await press('Retry message history');
 await act(async()=>mockError({code:'unavailable'}));await act(async()=>mockRows([row('Recovered history',1000)]));
 expect(content()).toContain('Recovered history');expect(content()).not.toContain('could not connect');
});
test('new draft after acknowledged send uses a fresh request ID',async()=>{
 await render();mockSend.mockResolvedValue({consultationId:room.consultationId,senderId:'p',type:'text'});
 await draft();await press('Send message');await draft('Second');await press('Send message');
 expect(mockSend.mock.calls[0][0].messageRequestId).not.toBe(mockSend.mock.calls[1][0].messageRequestId);
});

test('message bubbles distinguish participants without changing chronological order',async()=>{
 await render();await act(async()=>mockRows([row('new',2000),row('old',1000)]));
 const {Card}=require('../src/ui/design');const bubbles=tree.root.findAllByType(Card).filter(n=>n.props.style?.maxWidth==='92%');
 expect(bubbles.map(n=>n.props.tone)).toEqual(['mint','surface']);
 expect(bubbles.map(n=>n.props.style.alignSelf)).toEqual(['flex-end','flex-start']);
});

test('explicit history hides all composers even if a malformed room advertises sending',async()=>{
 await act(async()=>{tree=create(<Chat room={room} uid="p" readOnly/>);});
 expect(tree.root.findAllByType(Field)).toHaveLength(0);
 for(const title of ['Send message','Retry same message','Attach document'])expect(tree.root.findAllByType(Action).map(a=>a.props.title)).not.toContain(title);
 expect(tree.root.findAllByType(require('../src/screens/shared/ConsultationAttachments').ConsultationAttachmentComposer)).toHaveLength(0);
 await act(async()=>mockRows([row('existing clinical content',1000)]));expect(content()).toContain('existing clinical content');expect(content()).toContain('Read-only history');expect(mockSend).not.toHaveBeenCalled();
});

test('history attachment opens through the existing private reader without mounting upload controls',async()=>{
 const attachment={attachmentId:'b'.repeat(64),consultationId:room.consultationId,messageId:'b'.repeat(64),senderId:'d',filename:'Original synthetic report.pdf',contentType:'application/pdf',sizeBytes:100};
 mockView.mockRejectedValue({code:'functions/permission-denied'});
 await act(async()=>{tree=create(<Chat room={{...room,canSend:false}} uid="p" readOnly/>);});
 await act(async()=>mockRows([{...row('document',1000),type:'attachment',attachment}]));
 await press('View private document');
 expect(mockAttachmentSession).toHaveBeenCalledWith('p',room.consultationId);expect(mockView).toHaveBeenCalledWith(attachment);
 expect(mockSend).not.toHaveBeenCalled();expect(tree.root.findAllByType(Field)).toHaveLength(0);
});
