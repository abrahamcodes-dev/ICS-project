const React=require('react'),{act,create}=require('react-test-renderer');
const {StyleSheet,View,Image,AccessibilityInfo}=require('react-native');
const {SafeAreaView,SafeAreaInsetsContext}=require('react-native-safe-area-context');
const {Screen,Card,Copy,Status,Notice,usePalette}=require('../src/ui/design');
const {LoginLayout}=require('../src/screens/auth/LoginLayout'),{RegistrationLayout}=require('../src/screens/auth/RegistrationLayout');
const {WelcomeScreen,AccountAccessScreen,RoleSelectionScreen}=require('../src/screens/auth/OnboardingScreens');
let tree;
beforeEach(()=>jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true));
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jest.restoreAllMocks();});
async function mount(node){await act(async()=>{tree=create(<SafeAreaInsetsContext.Provider value={{top:24,left:0,right:0,bottom:16}}>{node}</SafeAreaInsetsContext.Provider>);});}

test.each(['guest','patient','doctor'])('%s shared screen is white while retaining functional cards and status colors',async role=>{
 await mount(<Screen variant={role==='guest'?'onboarding':'dashboard'}><Copy>{role}</Copy><Card tone="mint"><Copy>Functional card</Copy></Card><Status label="Warning" tone="warning"/><Notice message="Synthetic alert"/></Screen>);
 const safe=tree.root.findByType(SafeAreaView);expect(StyleSheet.flatten(safe.props.style).backgroundColor).toBe('#FFFFFF');
 const palette=require('../src/ui/theme').palettes.light;expect(palette.warningSurface).not.toBe('#FFFFFF');expect(palette.mint).not.toBe('#FFFFFF');expect(palette.errorSurface).not.toBe('#FFFFFF');
 expect(tree.root.findAllByType(Card)).toHaveLength(1);expect(tree.root.findAllByType(Status)).toHaveLength(1);
});
test.each(['login','registration'])('%s outer canvas is white and the language button remains available',async kind=>{
 const props={busy:false,photo:null,onChoosePhoto:()=>{},onRemovePhoto:()=>{}};
 await mount(kind==='login'?<LoginLayout {...props}><Copy>Form</Copy></LoginLayout>:<RegistrationLayout {...props}><Copy>Form</Copy></RegistrationLayout>);
 expect(StyleSheet.flatten(tree.root.findByType(SafeAreaView).props.style).backgroundColor).toBe('#FFFFFF');
 expect(tree.root.findAllByType(require('../src/i18n/react').LanguageSwitchButton)).toHaveLength(1);
 if(kind==='login')expect(tree.root.findAll(n=>n.props.pointerEvents==='none'&&StyleSheet.flatten(n.props.style)?.position==='absolute')).toHaveLength(0);
});
test.each(['welcome','account','roles'])('%s has no standalone decorative background views',async kind=>{
 const Component={welcome:WelcomeScreen,account:AccountAccessScreen,roles:RoleSelectionScreen}[kind];
 await mount(<Component navigation={{navigate:jest.fn()}}/>);
 expect(StyleSheet.flatten(tree.root.findByType(SafeAreaView).props.style).backgroundColor).toBe('#FFFFFF');
 expect(tree.root.findAll(n=>n.props.pointerEvents==='none'&&StyleSheet.flatten(n.props.style)?.position==='absolute')).toHaveLength(0);
 if(kind==='welcome')expect(tree.root.findByType(Image).props.source).toEqual(require('../assets/welcome-healthcare.png'));
 if(kind==='account')expect(tree.root.findByType(Image).props.source).toEqual(require('../assets/health-assistant-robot.png'));
});
test('video-stage and modal dimming tokens remain distinct from the white main canvas',()=>{
 const p=require('../src/ui/theme').palettes.light;expect(p.background).toBe('#FFFFFF');expect(p.mediaBackground).toBe('#081426');expect(p.onMedia).toBe('#F7F9FF');expect(p.overlay).toContain('rgba(');
});
