const React=require('react'),{create,act}=require('react-test-renderer');
let mockAuth,mockFocused=true,mockBackground;
const mockNavigation={navigate:jest.fn(),goBack:jest.fn()},mockRemove=jest.fn();
const originalAppState=require('react-native').AppState.currentState;
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>mockFocused,useNavigation:()=>mockNavigation}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>mockAuth}));
jest.mock('../src/screens/auth/AuthForm',()=> 'AuthForm');
const Chatbot=require('../src/screens/shared/ChatbotScreen').default;
const Login=require('../src/screens/auth/LoginScreen').default;
const {Action,Field}=require('../src/ui/design');
let tree;
const text=()=>JSON.stringify(tree.toJSON());
async function render(){await act(async()=>{tree=create(<Chatbot/>);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
async function ask(value){await act(async()=>tree.root.findByType(Field).props.onChangeText(value));await press('Send question');}
beforeEach(()=>{
 jest.clearAllMocks();mockFocused=true;mockAuth={status:'signedOut',firebaseUid:null,user:null};
 require('react-native').AppState.currentState='active';
 jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 jest.spyOn(require('react-native').AppState,'addEventListener').mockImplementation((_,fn)=>{mockBackground=fn;return {remove:mockRemove};});
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jest.restoreAllMocks();require('react-native').AppState.currentState=originalAppState;});
test('guest login exposes assistant without touching authentication form',()=>{
 const result=Login({navigation:mockNavigation});result.props.footer.props.onPress();
 expect(mockNavigation.navigate).toHaveBeenCalledWith('Chatbot');
});
test('guest conversation, reset and professional-care navigation',async()=>{
 await render();expect(text()).toContain('not a doctor');await ask('healthy eating');
 expect(text()).toContain('whole grains');await press('Reset conversation');
 expect(text()).not.toContain('whole grains');expect(tree.root.findByType(Field).props.value).toBe('');
 await press('Sign in for consultations');expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
 await press('Back');expect(mockNavigation.goBack).toHaveBeenCalled();
});
test('patient opens existing directory and account switch clears conversation',async()=>{
 mockAuth={status:'ready',firebaseUid:'p1',user:{role:'patient',status:'active'}};
 await render();await ask('healthy eating');expect(text()).toContain('whole grains');await press('Find a doctor');expect(mockNavigation.navigate).toHaveBeenCalledWith('Doctors');
 mockAuth={...mockAuth,firebaseUid:'p2'};await act(async()=>tree.update(<Chatbot/>));expect(text()).not.toContain('whole grains');
});
test('logout and blur discard transcript',async()=>{
 mockAuth={status:'ready',firebaseUid:'p',user:{role:'patient',status:'active'}};
 await render();await ask('healthy eating');expect(text()).toContain('whole grains');mockAuth={status:'signedOut',firebaseUid:null};
 await act(async()=>tree.update(<Chatbot/>));expect(text()).not.toContain('whole grains');
 await ask('healthy eating');expect(text()).toContain('whole grains');mockFocused=false;await act(async()=>tree.update(<Chatbot/>));expect(tree.toJSON()).toBeNull();
 mockFocused=true;await act(async()=>tree.update(<Chatbot/>));expect(text()).not.toContain('whole grains');
});
test('background clears state, foreground permits new conversation; unmount removes listener',async()=>{
 await render();await ask('healthy eating');expect(text()).toContain('whole grains');await act(async()=>mockBackground('background'));expect(text()).not.toContain('whole grains');
 expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Send question').props.disabled).toBe(true);
 await act(async()=>mockBackground('active'));await ask('handwashing');expect(text()).toContain('soap');
 await act(async()=>tree.unmount());tree=null;expect(mockRemove).toHaveBeenCalled();
});
test.each([
 {status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active'}},
 {status:'ready',firebaseUid:'p',user:{role:'patient',status:'disabled'}},
 {status:'loadingIdentity',firebaseUid:'p'},
])('non-eligible session does not retain chat controls',async state=>{
 mockAuth=state;await render();expect(tree.root.findAllByType(Field)).toHaveLength(0);
});
test('emergency reply, input errors and bounded conversation',async()=>{
 await render();await ask('chest pain');expect(text()).toContain('Urgent guidance');
 await ask('x'.repeat(501));expect(text()).toContain('1-500');
 await press('Reset conversation');
 for(let i=0;i<20;i++)await ask('hello');
 expect(text()).toContain('Conversation limit reached');
 await press('Reset conversation');expect(text()).not.toContain('Conversation limit reached');
});
