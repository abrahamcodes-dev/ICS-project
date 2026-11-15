const requireSafeArea=require('react-native-safe-area-context').SafeAreaInsetsContext;
const React=require('react');
const {act,create}=require('react-test-renderer');
const {WelcomeScreen,AccountAccessScreen,RoleSelectionScreen,SetupSuccess}=require('../src/screens/auth/OnboardingScreens');
const {Action,Copy}=require('../src/ui/design');
let tree;
beforeEach(()=>jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true));
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jest.restoreAllMocks();});
async function render(Component,props){await act(async()=>{tree=create(<requireSafeArea.Provider value={{top:24,right:0,bottom:24,left:0}}><Component {...props}/></requireSafeArea.Provider>);});}
function press(title){act(()=>tree.root.findAllByType(Action).find(n=>n.props.title===title).props.onPress());}
test('welcome enters account access',async()=>{const navigation={navigate:jest.fn()};await render(WelcomeScreen,{navigation});act(()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel==='Get Started'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('AccountAccess');});
test('account access offers registration, login and guest assistant without auth',async()=>{
 const navigation={navigate:jest.fn(),goBack:jest.fn()};await render(AccountAccessScreen,{navigation});
 for(const [prefix,route] of [['Create an account','RoleSelection'],['Sign in','Login']]){
  const button=tree.root.findAll(n=>n.props.accessibilityRole==='button'&&typeof n.props.style==='function'&&n.props.accessibilityLabel?.startsWith(prefix))[0];
  act(()=>button.props.onPress());expect(navigation.navigate).toHaveBeenCalledWith(route);
 }
 act(()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel==='Chat now'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('Chatbot');
 expect(tree.root.findAllByType(Copy).some(n=>String(n.props.children).includes('rule-based'))).toBe(true);
});
test.each(['patient','doctor'])('role selection passes only the %s public role',async role=>{
 const navigation={navigate:jest.fn(),goBack:jest.fn()};await render(RoleSelectionScreen,{navigation});
 const button=tree.root.findAll(n=>n.props.accessibilityRole==='button'&&typeof n.props.style==='function'&&n.props.accessibilityLabel?.startsWith(role==='patient'?'Patient.':'Doctor.'))[0];
 act(()=>button.props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('Register',{role});
});
test.each([false,true])('confirmed success continues through existing routing (doctor=%s)',async doctor=>{const onContinue=jest.fn();await render(SetupSuccess,{doctor,onContinue});press(doctor?'Continue to verification':'Go to Dashboard');expect(onContinue).toHaveBeenCalledTimes(1);});

test('welcome uses the supplied illustration and removes legacy branding',async()=>{await render(WelcomeScreen,{navigation:{navigate:jest.fn()}});const {Image}=require('react-native');expect(tree.root.findByType(Image).props.source).toEqual(require('../assets/welcome-doctor.png'));expect(tree.root.findByType(Image).props.resizeMode).toBe('contain');expect(JSON.stringify(tree.toJSON())).not.toContain('Care within reach.');});

test('account access uses original mascot, no profile artwork, and returns to welcome',async()=>{const navigation={navigate:jest.fn()};await render(AccountAccessScreen,{navigation});const {Image}=require('react-native');expect(tree.root.findAllByType(Image)).toHaveLength(1);expect(tree.root.findByType(Image).props.source).toEqual(require('../assets/health-assistant-robot.png'));act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Back to welcome'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('Welcome');});

test('role selection reuses approved artwork and has only the compact back control',async()=>{
 const navigation={navigate:jest.fn()};await render(RoleSelectionScreen,{navigation});const {Image}=require('react-native');
 expect(tree.root.findAllByType(Image).map(n=>n.props.source)).toEqual([require('../assets/role-patient.png'),require('../assets/welcome-doctor.png')]);
 expect(JSON.stringify(tree.toJSON())).not.toContain('Welcome to CallADoc');expect(JSON.stringify(tree.toJSON())).not.toContain('How would you like to use the app?');
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Back to account access'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('AccountAccess');
});
