const React=require('react'),{create,act}=require('react-test-renderer');
jest.mock('../src/services/googleAuth',()=>({googleConfigured:()=>true,googleConnection:jest.fn(()=>({password:true,linked:false})),linkGoogleAccount:jest.fn(),googleAuthMessage:()=> 'Could not link Google'}));
const {AccountConnections}=require('../src/components/AccountConnections'),{Action,Field}=require('../src/ui/design'),service=require('../src/services/googleAuth'),{Alert}=require('react-native');
let tree,alert;beforeEach(()=>{jest.clearAllMocks();service.googleConnection.mockReturnValue({password:true,linked:false});service.linkGoogleAccount.mockResolvedValue(true);alert=jest.spyOn(Alert,'alert');});afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;alert.mockRestore();});
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
async function open(){await act(async()=>{tree=create(<AccountConnections uid="synthetic"/>);});await press('Link Google account');await act(async()=>tree.root.findByType(Field).props.onChangeText('synthetic-password'));await press('Confirm Google linking');}
test('linking requires password and an explicit confirmation, preserving the existing profile',async()=>{
 await open();expect(service.linkGoogleAccount).not.toHaveBeenCalled();expect(alert.mock.calls[0][2][0].style).toBe('cancel');
 await act(async()=>alert.mock.calls[0][2].find(n=>n.text==='Link Google').onPress());
 expect(service.linkGoogleAccount).toHaveBeenCalledWith('synthetic-password');expect(tree.root.findAllByType(Field)).toHaveLength(0);expect(JSON.stringify(tree.toJSON())).toContain('linked to this account');
});
test('duplicate confirmation has one request; cancellation is not shown as linked',async()=>{
 service.linkGoogleAccount.mockResolvedValue(null);await open();const yes=alert.mock.calls[0][2].find(n=>n.text==='Link Google').onPress;
 await act(async()=>{yes();yes();});expect(service.linkGoogleAccount).toHaveBeenCalledTimes(1);expect(tree.root.findByType(Field).props.value).toBe('');expect(JSON.stringify(tree.toJSON())).not.toContain('linked to this account');
});
test('unknown Firebase account cannot receive a linking action',async()=>{
 service.googleConnection.mockReturnValue(null);await act(async()=>{tree=create(<AccountConnections uid="other"/>);});expect(tree.toJSON()).toBeNull();
});
