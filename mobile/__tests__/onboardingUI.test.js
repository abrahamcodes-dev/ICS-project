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

test('welcome uses the approved healthcare illustration without cropping or replacing live controls',async()=>{await render(WelcomeScreen,{navigation:{navigate:jest.fn()}});const {Image,StyleSheet}=require('react-native');const image=tree.root.findByType(Image);expect(image.props.source).toEqual(require('../assets/welcome-healthcare.png'));expect(image.props.resizeMode).toBe('contain');expect(StyleSheet.flatten(image.props.style)).toMatchObject({width:'100%',aspectRatio:1245/1263});expect(StyleSheet.flatten(image.props.style).position).not.toBe('absolute');expect(JSON.stringify(tree.toJSON())).not.toContain('Care within reach.');expect(JSON.stringify(tree.toJSON())).toContain('Get Started');});
test.each([[320,568,1.6],[412,915,1],[800,1280,1.3]])('welcome keeps artwork contained and one top-right control at %s x %s',async(width,height,fontScale)=>{
 jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width,height,fontScale,scale:2});
 const navigation={navigate:jest.fn()};await render(WelcomeScreen,{navigation});const {Image,StyleSheet}=require('react-native');
 expect(tree.root.findAllByType(require('../src/i18n/react').LanguageSwitchButton)).toHaveLength(1);
 expect(tree.root.findByType(Image).props.resizeMode).toBe('contain');const style=StyleSheet.flatten(tree.root.findByType(Image).props.style);
 expect(style.width).toBe('100%');expect(style.left).toBeUndefined();expect(style.bottom).toBeUndefined();
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Get Started'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('AccountAccess');
});

test('account access uses original mascot, no profile artwork, and returns to welcome',async()=>{const navigation={navigate:jest.fn()};await render(AccountAccessScreen,{navigation});const {Image}=require('react-native');expect(tree.root.findAllByType(Image)).toHaveLength(1);expect(tree.root.findByType(Image).props.source).toEqual(require('../assets/health-assistant-robot.png'));act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Back to welcome'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('Welcome');});

test('role selection uses approved pink artwork, preserves role navigation and the compact back control',async()=>{
 const navigation={navigate:jest.fn()};await render(RoleSelectionScreen,{navigation});const {Image}=require('react-native');
 expect(tree.root.findAllByType(Image).map(n=>n.props.source)).toEqual([require('../assets/calladoc_patient_pink.png'),require('../assets/calladoc_doctor_pink.png')]);
 expect(JSON.stringify(tree.toJSON())).not.toContain('Welcome to CallADoc');expect(JSON.stringify(tree.toJSON())).not.toContain('How would you like to use the app?');
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Back to account access'&&typeof n.props.style==='function')[0].props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('AccountAccess');
});
test.each([[320,1.6],[412,1],[412,1.3],[800,1.3]])('pink role illustrations stay contained on a %s dp display',async(width,fontScale)=>{
 const {Image,StyleSheet}=require('react-native');jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width,height:800,fontScale,scale:2});
 const navigation={navigate:jest.fn()};await render(RoleSelectionScreen,{navigation});
 for(const role of ['patient','doctor']){
  const image=tree.root.findAllByType(Image).find(n=>n.props.testID===role+'-illustration');const style=StyleSheet.flatten(image.props.style);
  expect(image.props.resizeMode).toBe('contain');expect(style.width).toBe('100%');expect(style.height).toBe('100%');expect(style.aspectRatio).toBeUndefined();expect(style.position).toBeUndefined();expect(style.tintColor).toBeUndefined();expect(style.left).toBeUndefined();
  const frame=tree.root.findByProps({testID:role+'-illustration-container'});const bounds=StyleSheet.flatten(frame.props.style);expect(bounds.backgroundColor).toBeUndefined();expect(bounds.width).toBeGreaterThanOrEqual(72);expect(bounds.width).toBeLessThanOrEqual(167);expect(bounds.height).toBe(150);expect(bounds.padding).toBe(0);expect(bounds.flexShrink).toBe(0);expect(bounds.alignSelf).toBeUndefined();expect(frame.findAllByType(Image)).toHaveLength(1);expect(frame.children).toHaveLength(1);
  const card=tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel?.startsWith(role==='patient'?'Patient.':'Doctor.')&&typeof n.props.style==='function')[0];
  expect(card.props.style({pressed:false}).minHeight).toBeGreaterThanOrEqual(174);act(()=>card.props.onPress());expect(navigation.navigate).toHaveBeenCalledWith('Register',{role});
 }
});

test('Pixel 7 role artwork gets about 60 percent more visible contain width without changing card styling',async()=>{
 const rn=require('react-native');jest.spyOn(rn,'useWindowDimensions').mockReturnValue({width:412,height:915,fontScale:1,scale:2.625});
 await render(RoleSelectionScreen,{navigation:{navigate:jest.fn()}});
 for(const role of ['patient','doctor']){
  const frame=tree.root.findByProps({testID:role+'-illustration-container'}),b=rn.StyleSheet.flatten(frame.props.style);expect(b.width).toBe(141);expect(b.height).toBe(150);
  const previousContainWidth=104-16;expect(b.width/previousContainWidth).toBeGreaterThanOrEqual(1.5);expect(b.width/previousContainWidth).toBeLessThanOrEqual(1.7);
  const ratio=role==='patient'?1030/771:1354/1162;expect(b.width/ratio).toBeLessThan(b.height);
  const card=tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel?.startsWith(role==='patient'?'Patient.':'Doctor.')&&typeof n.props.style==='function')[0];expect(card.props.style({pressed:false})).toMatchObject({minHeight:174,borderRadius:26,paddingRight:14,gap:10,overflow:'hidden'});
 }
});
test('larger fonts reserve more room for role text instead of enlarging or cropping artwork',async()=>{
 const rn=require('react-native');jest.spyOn(rn,'useWindowDimensions').mockReturnValue({width:412,height:915,fontScale:1.3,scale:2.625});await render(RoleSelectionScreen,{navigation:{navigate:jest.fn()}});
 for(const role of ['patient','doctor']){const frame=tree.root.findByProps({testID:role+'-illustration-container'});expect(rn.StyleSheet.flatten(frame.props.style).width).toBe(108);}
});
