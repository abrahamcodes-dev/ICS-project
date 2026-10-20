const React=require('react'),{create,act}=require('react-test-renderer');
const mockList=jest.fn(),mockRead=jest.fn(),mockOpen=jest.fn(),mockDispose=jest.fn();let mockIdentity;
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>true}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>({})}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
jest.mock('../src/services/notificationService',()=>({createNotificationSession:()=>({list:mockList,read:mockRead,open:mockOpen,dispose:mockDispose}),
 notificationLabels:{message:'New consultation message'},registerForPushNotifications:jest.fn()}));
jest.mock('../src/services/notificationDevice',()=>({revokeNotificationDevice:jest.fn()}));
const {NotificationInbox,notificationRoute}=require('../src/screens/shared/NotificationsScreen'),{Action}=require('../src/ui/design');
let tree;const navigate=jest.fn(),item={id:'a'.repeat(64),kind:'message',createdAt:123,read:false};
async function render(){await act(async()=>{tree=create(<NotificationInbox uid="p" open={navigate}/>);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(b=>b.props.title===title).props.onPress());}
const text=()=>JSON.stringify(tree.toJSON());
beforeEach(()=>{jest.clearAllMocks();mockList.mockReset().mockResolvedValue({items:[item],nextCursor:null});mockRead.mockResolvedValue();mockOpen.mockReset();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('pagination deduplicates; mark read updates only after acknowledgment',async()=>{
 mockList.mockResolvedValueOnce({items:[item],nextCursor:item.id}).mockResolvedValue({items:[item],nextCursor:null});
 await render();await press('Older notifications');expect(tree.root.findAllByType(Action).filter(b=>b.props.title==='Open update')).toHaveLength(1);
 await press('Mark read');expect(mockRead).toHaveBeenCalledWith(item.id);expect(tree.root.findAllByType(Action).some(b=>b.props.title==='Mark read')).toBe(false);
});
test('opening denied event cannot navigate; valid event uses reauthorized destination',async()=>{
 await render();mockOpen.mockRejectedValueOnce(Error('denied'));await press('Open update');expect(navigate).not.toHaveBeenCalled();
 mockOpen.mockResolvedValue({target:'consultation',appointmentId:item.id});await press('Open update');expect(navigate).toHaveBeenCalledWith({target:'consultation',appointmentId:item.id});
});
test('loading error retries and empty state',async()=>{
 mockList.mockRejectedValueOnce(Error('offline'));await render();expect(text()).toContain('Unable to load');
 mockList.mockResolvedValue({items:[],nextCursor:null});await press('Refresh notifications');expect(text()).toContain('No notifications yet');
});
test('identity change clears list and ignores late open',async()=>{
 let resolve;await render();mockOpen.mockReturnValue(new Promise(r=>{resolve=r;}));await press('Open update');
 await act(async()=>mockIdentity());await act(async()=>resolve({target:'appointments'}));expect(navigate).not.toHaveBeenCalled();
 expect(text()).not.toContain('New consultation message');expect(mockDispose).toHaveBeenCalled();
});
test('unmount discards pending list',async()=>{
 let resolve;mockList.mockReturnValue(new Promise(r=>{resolve=r;}));await render();await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve({items:[item],nextCursor:null}));expect(mockDispose).toHaveBeenCalled();
});
test('role-specific routes keep existing authorized destination screens',()=>{
 expect(notificationRoute('patient',{target:'consultation',appointmentId:item.id})).toEqual({name:'Consultation',params:{appointmentId:item.id}});
 expect(notificationRoute('doctor',{target:'consultation',appointmentId:item.id}).name).toBe('ConsultationRoom');
 expect(notificationRoute('patient',{target:'prescriptions'}).name).toBe('Prescriptions');
 expect(notificationRoute('doctor',{target:'appointments'}).name).toBe('Appointments');
});
