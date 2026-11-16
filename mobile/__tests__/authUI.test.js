const React=require('react'),{act,create}=require('react-test-renderer');
jest.mock('../src/services/authService',()=>({loginUser:jest.fn(),registerUser:jest.fn(),completeUserRegistration:jest.fn()}));
const {loginUser,registerUser,completeUserRegistration}=require('../src/services/authService');
const {default:AuthForm,validateAuth,authError}=require('../src/screens/auth/AuthForm');
const {Field,Action,Notice,Card}=require('../src/ui/design');
let tree;
async function render(mode,role='patient'){await act(async()=>{tree=create(<AuthForm mode={mode} initialRole={role}/>);});}
async function fill(label,value){await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label===label).props.onChangeText(value));}
async function press(title){if(['Create account','Retry account setup'].includes(title)){const c=tree.root.findAllByType(require('../src/components/PatientConsentControls').PatientConsentControls)[0];if(c)await act(async()=>c.props.onChange({privacyAcknowledged:true,sharingDecision:'declined'}));}await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
beforeEach(()=>{jest.resetAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test.each(['recover'])('%s Card receives no raw text or numeric children',async mode=>{
 await act(async()=>{tree=create(<AuthForm mode={mode} onAlternate={jest.fn()} footer={<Action title="Sign out" onPress={jest.fn()}/>}/>);});
 const children=React.Children.toArray(tree.root.findByType(Card).props.children);
 expect(children.filter(child=>typeof child==='string'||typeof child==='number')).toEqual([]);
});
test('login trims email but preserves password and toggles visibility',async()=>{
 await render('login');await fill('Email',' test@example.test ');await fill('Password',' secret ');
 expect(tree.root.findAllByType(Field)[1].props.secureTextEntry).toBe(true);await act(async()=>tree.root.findByProps({accessibilityRole:'button',accessibilityLabel:'Show password'}).props.onPress());expect(tree.root.findAllByType(Field)[1].props.secureTextEntry).toBe(false);
 await press('Sign in');expect(loginUser).toHaveBeenCalledWith('test@example.test',' secret ');
});
test.each(['patient','doctor'])('%s registration uses existing service with explicit public role',async role=>{
 await render('register',role);await fill('Full name',' Test Person ');await fill('Email','test@example.test');await fill('Password','secret123');await fill('Confirm password','secret123');await press('Create account');
 expect(registerUser).toHaveBeenCalledWith('test@example.test','secret123','Test Person',role,role==='patient'?{privacyAcknowledged:true,sharingDecision:'declined'}:undefined);
});
test('invalid form never calls authentication',async()=>{await render('login');await press('Sign in');expect(loginUser).not.toHaveBeenCalled();expect(tree.root.findByType(Notice).props.message).toMatch(/email/);});
test('partial registration retries completion without creating Auth account',async()=>{await render('recover');await fill('Full name','Test');await press('Retry account setup');expect(completeUserRegistration).toHaveBeenCalledWith('Test','patient',{privacyAcknowledged:true,sharingDecision:'declined'});expect(registerUser).not.toHaveBeenCalled();});
test('busy submission is deduplicated and network error is safe',async()=>{
 let reject;loginUser.mockReturnValue(new Promise((_,r)=>reject=r));await render('login');await fill('Email','test@example.test');await fill('Password','secret');await press('Sign in');await press('Sign in');expect(loginUser).toHaveBeenCalledTimes(1);
 await act(async()=>reject({code:'auth/network-request-failed',message:'private'}));expect(tree.root.findByType(Notice).props.message).toMatch(/connection/);
});
test('registration validates confirmation and name bounds; errors never expose raw backend details',()=>{
 expect(validateAuth('register','a@b.test','secret','Test','different')).toMatch(/match/);
 expect(validateAuth('recover','','','x'.repeat(201),'')).toMatch(/full name/);
 expect(authError({message:'private credential'})).not.toMatch(/private credential/);
});

test('confirmation waits for the existing service to confirm canonical identity',async()=>{
 const onComplete=jest.fn();let resolve;
 completeUserRegistration.mockReturnValue(new Promise(r=>resolve=r));
 await act(async()=>{tree=create(<AuthForm mode="recover" initialRole="doctor" onComplete={onComplete}/>);});
 await fill('Full name','Doctor Test');await press('Retry account setup');expect(onComplete).not.toHaveBeenCalled();
 await act(async()=>resolve({uid:'doctor-confirmed',role:'doctor'}));
 expect(onComplete).toHaveBeenCalledWith('doctor-confirmed');expect(completeUserRegistration).toHaveBeenCalledWith('Doctor Test','doctor',undefined);
});
test('failed completion never shows success',async()=>{
 const onComplete=jest.fn();completeUserRegistration.mockRejectedValue({code:'registration-incomplete'});
 await act(async()=>{tree=create(<AuthForm mode="recover" onComplete={onComplete}/>);});
 await fill('Full name','Test');await press('Retry account setup');expect(onComplete).not.toHaveBeenCalled();
 expect(tree.root.findByType(Notice).props.message).toMatch(/registration is not confirmed/);
});

test('registration has compact layout, ordered fields and independent password toggles',async()=>{
 const back=jest.fn(),signIn=jest.fn();
 await act(async()=>{tree=create(<AuthForm mode="register" initialRole="doctor" onBack={back} onAlternate={signIn}/>);});
 expect(tree.root.findAllByType(Field).map(n=>n.props.label)).toEqual(['Full name','Email','Password','Confirm password']);
 expect(tree.root.findAllByType(require('../src/ui/design').Brand)).toHaveLength(0);
 expect(tree.root.findAllByType(Card)).toHaveLength(0);
 expect(tree.root.findAllByType(Action).map(n=>n.props.title)).toEqual(['Create account']);
 const button=label=>tree.root.findByProps({accessibilityLabel:label,accessibilityRole:'button'});
 await act(async()=>button('Show password').props.onPress());
 expect(tree.root.findAllByType(Field).find(n=>n.props.label==='Password').props.secureTextEntry).toBe(false);
 expect(tree.root.findAllByType(Field).find(n=>n.props.label==='Confirm password').props.secureTextEntry).toBe(true);
 await act(async()=>button('Show confirm password').props.onPress());
 expect(tree.root.findAllByType(Field).find(n=>n.props.label==='Confirm password').props.secureTextEntry).toBe(false);
 await act(async()=>button('Back to role selection').props.onPress());expect(back).toHaveBeenCalledTimes(1);
 await act(async()=>tree.root.findByProps({accessibilityRole:'link',accessibilityLabel:'Sign in'}).props.onPress());expect(signIn).toHaveBeenCalledTimes(1);
 await press('Create account');expect(registerUser).not.toHaveBeenCalled();expect(tree.root.findByType(Notice).props.message).toBeTruthy();
});

test('login layout exposes working navigation without branding, cards or reset placeholder',async()=>{
 const Login=require('../src/screens/auth/LoginScreen').default;
 const navigation={canGoBack:jest.fn(()=>true),goBack:jest.fn(),navigate:jest.fn()};
 await act(async()=>{tree=create(<Login navigation={navigation}/>);});
 expect(tree.root.findAllByType(Card)).toHaveLength(0);
 expect(tree.root.findAllByType(require('../src/ui/design').Brand)).toHaveLength(0);
 const fields=tree.root.findAllByType(Field);expect(fields.map(n=>n.props.placeholder)).toEqual(['Enter your email','Enter your password']);
 expect(JSON.stringify(tree.toJSON())).not.toContain('Forgot password');
 const tap=(label,role='button')=>act(async()=>tree.root.findByProps({accessibilityLabel:label,accessibilityRole:role}).props.onPress());
 await tap('Sign up','link');expect(navigation.navigate).toHaveBeenLastCalledWith('RoleSelection');
 await tap('Continue with health assistant');expect(navigation.navigate).toHaveBeenLastCalledWith('Chatbot');
 await tap('Back');expect(navigation.goBack).toHaveBeenCalledTimes(1);
 navigation.canGoBack.mockReturnValue(false);await tap('Back');expect(navigation.navigate).toHaveBeenLastCalledWith('AccountAccess');
 await fill('Password','secret');await tap('Show password');expect(fields[1].props.secureTextEntry).toBe(false);
 await tap('Hide password');expect(fields[1].props.secureTextEntry).toBe(true);
});
