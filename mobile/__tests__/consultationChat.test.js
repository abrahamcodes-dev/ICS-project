const React = require('react');
const {act, create} = require('react-test-renderer');
const {Action, Field} = require('../src/ui/design');
let mockRows, mockError, mockIdentity;
const mockSend = jest.fn();
const mockDispose = jest.fn();
const mockOlder = jest.fn();
jest.mock('../src/services/authService', () => ({onIdentityRefresh: fn => {mockIdentity=fn; return jest.fn();}}));
jest.mock('../src/services/consultationService', () => ({
  sendConsultationMessage: input => mockSend({...input}),
  createConsultationMessageSession: () => ({dispose:mockDispose,loadOlder:mockOlder,start:(_,rows,error)=>{mockRows=rows;mockError=error;}}),
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
test('new draft after acknowledged send uses a fresh request ID',async()=>{
 await render();mockSend.mockResolvedValue({consultationId:room.consultationId,senderId:'p',type:'text'});
 await draft();await press('Send message');await draft('Second');await press('Send message');
 expect(mockSend.mock.calls[0][0].messageRequestId).not.toBe(mockSend.mock.calls[1][0].messageRequestId);
});
