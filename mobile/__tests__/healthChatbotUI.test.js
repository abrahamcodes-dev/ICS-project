const React=require('react'),{create,act}=require('react-test-renderer');
let mockAuth,mockFocused=true,mockBackground;
const mockNavigation={navigate:jest.fn(),goBack:jest.fn()},mockRemove=jest.fn();
const originalAppState=require('react-native').AppState.currentState;
jest.mock('@react-navigation/native',()=>({useIsFocused:()=>mockFocused,useNavigation:()=>mockNavigation}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:()=>mockAuth}));
jest.mock('../src/screens/auth/AuthForm',()=> 'AuthForm');
const Chatbot=require('../src/screens/shared/ChatbotScreen').default;
const Login=require('../src/screens/auth/LoginScreen').default;
const {TextInput}=require('react-native');
const {Action,Copy}=require('../src/ui/design');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
let tree;
const hosts=()=>tree.root.findAll(n=>typeof n.type==='string'&&n.props.accessible&&typeof n.props.accessibilityLabel==='string');
const replyHosts=()=>hosts().filter(n=>/^(Assistant:|Urgent guidance:)/.test(n.props.accessibilityLabel));
const text=()=>JSON.stringify(tree.toJSON());
async function render(){await act(async()=>{tree=create(<Chatbot/>);});}
async function press(title){await act(async()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===title)[0].props.onPress());}
async function ask(value){await act(async()=>tree.root.findByType(TextInput).props.onChangeText(value));await press('Send question');}
beforeEach(()=>{
 jest.clearAllMocks();mockFocused=true;mockAuth={status:'signedOut',firebaseUid:null,user:null};
 require('react-native').AppState.currentState='active';
 jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 jest.spyOn(require('react-native').AppState,'addEventListener').mockImplementation((_,fn)=>{mockBackground=fn;return {remove:mockRemove};});
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jest.restoreAllMocks();require('react-native').AppState.currentState=originalAppState;});
test('guest login exposes assistant without touching authentication form',()=>{
 const result=Login({navigation:mockNavigation});expect(result.type).toBe('AuthForm');
 expect(result.props.mode).toBe('login');
 let openAssistant;
 if(result.props.onAssistant!==undefined){openAssistant=result.props.onAssistant;}
 else{
  expect(result.props.footer.type).toBe(Action);
  expect(result.props.footer.props.title).toBe('Health assistant (no sign-in needed)');
  openAssistant=result.props.footer.props.onPress;
 }
 expect(openAssistant).toEqual(expect.any(Function));
 expect(mockNavigation.navigate).not.toHaveBeenCalled();openAssistant();
 expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
 expect(mockNavigation.navigate).toHaveBeenCalledWith('Chatbot');
});
test('guest conversation, reset and professional-care navigation',async()=>{
 await render();await press('About this assistant');expect(text()).toContain('not a doctor');await ask('healthy eating');
 expect(text()).toContain('whole grains');await press('Reset conversation');
 expect(text()).not.toContain('whole grains');expect(tree.root.findByType(TextInput).props.value).toBe('');
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
 expect(tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel==='Send question')[0].props.disabled).toBe(true);
 await act(async()=>mockBackground('active'));await ask('handwashing');expect(text()).toContain('soap');
 await act(async()=>tree.unmount());tree=null;expect(mockRemove).toHaveBeenCalled();
});
test.each([
 {status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active'}},
 {status:'ready',firebaseUid:'p',user:{role:'patient',status:'disabled'}},
 {status:'loadingIdentity',firebaseUid:'p'},
])('non-eligible session does not retain chat controls',async state=>{
 mockAuth=state;await render();expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
});
test('emergency reply, input errors and bounded conversation',async()=>{
 await render();await ask('chest pain');expect(text()).toContain('Urgent guidance');
 await ask('x'.repeat(501));expect(text()).toContain('1-500');
 await press('Reset conversation');
 for(let i=0;i<20;i++)await ask('hello');
 expect(text()).toContain('Conversation limit reached');
 await press('Reset conversation');expect(text()).not.toContain('Conversation limit reached');
});

test.each(require('../src/screens/shared/ChatbotScreen').suggestedQuestions)('suggestion uses supported rules: %s',async question=>{
 await render();const reply=require('../src/services/chatbotService').askChatbot(question);expect(reply.intent).not.toBe('unknown');await press(question);
 const displayed=tree.root.findAllByType(Copy).map(n=>React.Children.toArray(n.props.children).filter(c=>typeof c==='string').join(''));
 expect(replyHosts().map(n=>n.props.accessibilityLabel)).toContain(`Assistant: ${reply.response}`);
 expect(tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===question)).toHaveLength(0);
});
test('composer, mascot and rule-based limitations are visible without opening About',async()=>{
 await render();const {Image}=require('react-native');expect(tree.root.findByType(Image).props.source).toEqual(require('../assets/health-assistant-robot.png'));
 expect(tree.root.findByType(TextInput).props.placeholder).toBe('Type your question...');
 expect(text()).toContain('Rule-based information assistant');expect(text()).toContain('not a doctor');
 expect(text()).toContain('Keywords can miss emergencies');expect(text()).toContain('not a triage service');
 expect(text()).toContain('Do not share names');expect(text()).not.toContain('Your AI health assistant');
 expect(text()).not.toContain('Conversation clears when');expect(text()).toContain(MEDICAL_DISCLAIMER);
});
test.each(['healthy eating','diagnose me','which medication','quantum physics','My baby is not breathing','I ate fruit and my throat is swelling'])('welcome and rendered %s reply each have exactly one approved disclaimer',async question=>{
 await render();await ask(question);
 const responses=tree.root.findAllByType(Copy).map(n=>React.Children.toArray(n.props.children).filter(c=>typeof c==='string').join('')).filter(s=>s.includes(MEDICAL_DISCLAIMER));
 expect(responses).toHaveLength(2);responses.forEach(response=>expect(response.split(MEDICAL_DISCLAIMER)).toHaveLength(2));
 if(question==='quantum physics'){expect(text()).toContain('verified CallADoc doctor');expect(mockNavigation.navigate).not.toHaveBeenCalled();}
});

test.each(['reset','logout','account switch','blur','background','unmount'])('topic context clears with transcript on %s',async boundary=>{
 mockAuth={status:'ready',firebaseUid:'p1',user:{role:'patient',status:'active'}};
 await render();await ask('Explain malaria');await ask('What causes it');
 expect(text()).toContain('parasites passed');
 if(boundary==='reset')await press('Reset conversation');
 if(boundary==='logout'){mockAuth={status:'signedOut',firebaseUid:null};await act(async()=>tree.update(<Chatbot/>));}
 if(boundary==='account switch'){mockAuth={...mockAuth,firebaseUid:'p2'};await act(async()=>tree.update(<Chatbot/>));}
 if(boundary==='blur'){
  mockFocused=false;await act(async()=>tree.update(<Chatbot/>));
  mockFocused=true;await act(async()=>tree.update(<Chatbot/>));
 }
 if(boundary==='background'){
  await act(async()=>mockBackground('background'));await act(async()=>mockBackground('active'));
 }
 if(boundary==='unmount'){await act(async()=>tree.unmount());tree=null;await render();}
 expect(text()).not.toContain('parasites passed');await ask('What causes it');
 expect(text()).toContain('Please name the health topic');expect(text()).not.toContain('parasites passed');
 const responses=replyHosts().map(n=>n.props.accessibilityLabel);
 expect(responses).toHaveLength(1);expect(responses[0].split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});

test('safety notices and disclaimers stay accessible in scrollable content, outside the fixed composer',async()=>{
 await render();const {ScrollView}=require('react-native');
 const copy=tree.root.findByType(ScrollView).findAllByType(Copy);
 expect(copy.some(node=>node.props.children===require('../src/services/chatbotService').CHATBOT_DISCLAIMER&&node.props.accessible&&node.props.selectable)).toBe(true);
 expect(copy.some(node=>typeof node.props.children==='string'&&node.props.children.includes('Keywords can miss emergencies')&&node.props.accessible)).toBe(true);
 expect(hosts().some(node=>node.props.accessibilityLabel===require('../src/services/chatbotService').CHATBOT_WELCOME)).toBe(true);
 const footer=tree.root.findByProps({testID:'health-chat-composer'});
 expect(footer.findAllByType(Copy).some(node=>typeof node.props.children==='string'&&node.props.children.includes('not a triage service'))).toBe(false);
});
test('Android focused input reserves toolbar clearance and exposes an accessible dismissal action',async()=>{
 jest.replaceProperty(require('react-native').Platform,'OS','android');
 await render();const {Keyboard}=require('react-native');const dismiss=jest.spyOn(Keyboard,'dismiss');
 const initial=tree.root.findByProps({testID:'health-chat-composer'}).props.style.paddingBottom;
 await act(async()=>tree.root.findByType(TextInput).props.onFocus());
 expect(tree.root.findByProps({testID:'health-chat-composer'}).props.style.paddingBottom).toBeGreaterThan(initial);
 // Count native accessibility hosts, not Pressable's platform-specific wrappers.
 expect(tree.root.findAll(node=>typeof node.type==='string'&&node.props.accessibilityLabel==='Dismiss keyboard'&&node.props.accessibilityRole==='button')).toHaveLength(1);
 await press('Dismiss keyboard');expect(dismiss).toHaveBeenCalled();
 expect(tree.root.findByProps({testID:'health-chat-composer'}).props.style.paddingBottom).toBe(initial);
 expect(tree.root.findAll(node=>node.props.accessibilityLabel==='Dismiss keyboard')).toHaveLength(0);
});
test('keyboard Send submits once, clears input and cannot submit empty text',async()=>{
 await render();await act(async()=>tree.root.findByType(TextInput).props.onChangeText('healthy eating'));
 const input=tree.root.findByType(TextInput);expect(input.props.returnKeyType).toBe('send');expect(input.props.submitBehavior).toBe('submit');
 expect(input.props.accessibilityHint).toContain('without identifying details');
 await act(async()=>input.props.onSubmitEditing());expect(tree.root.findByType(TextInput).props.value).toBe('');
 await act(async()=>tree.root.findByType(TextInput).props.onSubmitEditing());
 const replies=replyHosts().filter(node=>node.props.accessibilityLiveRegion==='polite');expect(replies).toHaveLength(1);
 expect(text()).toContain('whole grains');
});
test('only the newest reply announces; emergency announcements include the disclaimer',async()=>{
 await render();await ask('healthy eating');await ask('My baby is not breathing');
 const responses=replyHosts();
 expect(responses.map(node=>node.props.accessibilityLiveRegion)).toEqual(['none','assertive']);
 expect(responses[0].props.accessibilityRole).toBeUndefined();expect(responses[1].props.accessibilityRole).toBe('alert');
 expect(responses.every(node=>node.props.accessible)).toBe(true);
 expect(responses[1].props.accessibilityLabel).toContain(MEDICAL_DISCLAIMER);
 await ask('hello');const historical=replyHosts().filter(node=>node.props.accessibilityLiveRegion==='none');
 expect(historical).toHaveLength(2);expect(historical.every(node=>node.props.accessibilityRole!=='alert')).toBe(true);
});
test('input blur releases clearance; resetting does not retain draft or focused controls',async()=>{
 await render();await act(async()=>tree.root.findByType(TextInput).props.onFocus());
 await act(async()=>tree.root.findByType(TextInput).props.onBlur());
 expect(tree.root.findAll(node=>node.props.accessibilityLabel==='Dismiss keyboard')).toHaveLength(0);
 await act(async()=>{tree.root.findByType(TextInput).props.onFocus();tree.root.findByType(TextInput).props.onChangeText('unsent question');});
 await press('Reset conversation');expect(tree.root.findByType(TextInput).props.value).toBe('');
 expect(tree.root.findAll(node=>node.props.accessibilityLabel==='Dismiss keyboard')).toHaveLength(0);
});
function luminance(hex){const values=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;}
test('medical guidance is separated without shrinking or losing its accessible response',async()=>{
 await render();await ask('What causes a cold?');
 const guidance=tree.root.findAll(node=>typeof node.type==='string'&&node.props.testID==='assistant-medical-guidance');expect(guidance).toHaveLength(2);
 for(const section of guidance){
  expect(section.props.style.borderTopWidth).toBe(1);
  const copy=section.findAllByType(Copy);expect(copy[0].props.children).toBe('Medical guidance');
  expect(copy[1].props.children).toBe(MEDICAL_DISCLAIMER);expect(copy[1].props.style.fontSize).toBe(16);
  expect(copy[1].props.selectable).toBe(true);expect(copy.every(n=>n.props.accessible===false)).toBe(true);
 }
 expect(replyHosts()).toHaveLength(1);expect(replyHosts()[0].props.accessibilityLabel.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('sleep duration and pizza answers render with accessible disclaimers; reset clears intent context',async()=>{
 await render();await ask('How many hours of sleep are good for me?');
 expect(text()).toContain('CDC adult guidance');expect(replyHosts()[0].props.accessibilityLabel).toContain(MEDICAL_DISCLAIMER);
 await ask('Is pizza good for me?');expect(text()).toContain('portion size');
 expect(replyHosts()).toHaveLength(2);expect(replyHosts().every(n=>n.props.accessibilityLabel.split(MEDICAL_DISCLAIMER).length===2)).toBe(true);
 await press('Reset conversation');await ask('How many hours?');
 expect(text()).not.toContain('CDC adult guidance');expect(text()).toContain('Please name the health topic');
});
test.each(['light','dark'])('%s chatbot text and action colors meet 4.5:1 contrast',scheme=>{
 const p=require('../src/ui/theme').palettes[scheme];
 for(const [foreground,background]of [[p.text,p.background],[p.text,p.mint],[p.text,p.surface],[p.muted,p.background],[p.muted,p.surface],[p.muted,p.mint],[p.accent,p.background],[p.accent,p.surface],[p.onPrimary,p.primary]]){
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  expect((values[0]+0.05)/(values[1]+0.05)).toBeGreaterThanOrEqual(4.5);
 }
});
