const React=require('react'),{act,create}=require('react-test-renderer');
jest.mock('../src/services/authService',()=>({loginUser:jest.fn(),registerUser:jest.fn(),completeUserRegistration:jest.fn()}));
const {loginUser,registerUser,completeUserRegistration}=require('../src/services/authService');
const {default:AuthForm,validateAuth,authError}=require('../src/screens/auth/AuthForm');
const {Field,Action,Notice}=require('../src/ui/design');
let tree;
async function render(mode){await act(async()=>{tree=create(<AuthForm mode={mode}/>);});}
async function fill(label,value){await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label===label).props.onChangeText(value));}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
beforeEach(()=>{jest.resetAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('login trims email but preserves password and toggles visibility',async()=>{
 await render('login');await fill('Email',' test@example.test ');await fill('Password',' secret ');
 expect(tree.root.findAllByType(Field)[1].props.secureTextEntry).toBe(true);await press('Show password');expect(tree.root.findAllByType(Field)[1].props.secureTextEntry).toBe(false);
 await press('Sign in');expect(loginUser).toHaveBeenCalledWith('test@example.test',' secret ');
});
test.each(['patient','doctor'])('%s registration uses existing service with explicit public role',async role=>{
 await render('register');if(role==='doctor')await press('Register as a doctor');await fill('Full name',' Test Person ');await fill('Email','test@example.test');await fill('Password','secret123');await fill('Confirm password','secret123');await press('Create account');
 expect(registerUser).toHaveBeenCalledWith('test@example.test','secret123','Test Person',role);
});
test('invalid form never calls authentication',async()=>{await render('login');await press('Sign in');expect(loginUser).not.toHaveBeenCalled();expect(tree.root.findByType(Notice).props.message).toMatch(/email/);});
test('partial registration retries completion without creating Auth account',async()=>{await render('complete');await fill('Full name','Test');await press('Complete setup');expect(completeUserRegistration).toHaveBeenCalledWith('Test','patient');expect(registerUser).not.toHaveBeenCalled();});
test('busy submission is deduplicated and network error is safe',async()=>{
 let reject;loginUser.mockReturnValue(new Promise((_,r)=>reject=r));await render('login');await fill('Email','test@example.test');await fill('Password','secret');await press('Sign in');await press('Sign in');expect(loginUser).toHaveBeenCalledTimes(1);
 await act(async()=>reject({code:'auth/network-request-failed',message:'private'}));expect(tree.root.findByType(Notice).props.message).toMatch(/connection/);
});
test('registration validates confirmation and name bounds; errors never expose raw backend details',()=>{
 expect(validateAuth('register','a@b.test','secret','Test','different')).toMatch(/match/);
 expect(validateAuth('complete','','','x'.repeat(201),'')).toMatch(/full name/);
 expect(authError({message:'private credential'})).not.toMatch(/private credential/);
});
