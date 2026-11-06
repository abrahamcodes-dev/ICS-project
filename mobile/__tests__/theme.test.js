const mockReact=require('react'),{create,act}=require('react-test-renderer');
let mockScheme='light';const mockListeners=new Set();
jest.mock('react-native',()=>Object.defineProperty(Object.create(jest.requireActual('react-native')),'useColorScheme',{value:()=>mockReact.useSyncExternalStore(listener=>{mockListeners.add(listener);return()=>mockListeners.delete(listener);},()=>mockScheme)}));
const mockMount=jest.fn();
jest.mock('@react-navigation/native',()=>({DefaultTheme:{colors:{}},DarkTheme:{colors:{}},NavigationContainer:({children,theme})=>{const [route,setRoute]=mockReact.useState('Home');mockReact.useEffect(()=>{mockMount();},[]);return mockReact.createElement('Navigation',{theme,route,go:()=>setRoute('Details')},children);}}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:jest.fn()}));
jest.mock('../src/navigation/GuestNavigator',()=> 'Guest');jest.mock('../src/navigation/PatientNavigator',()=> 'Patient');jest.mock('../src/navigation/DoctorNavigator',()=> 'Doctor');jest.mock('../src/navigation/AdminNavigator',()=> 'Admin');
jest.mock('../src/screens/auth/AccountStatusScreen',()=> 'AccountStatus');jest.mock('../src/screens/doctor/SubmitVerificationScreen',()=> 'Verification');jest.mock('../src/screens/shared/NotificationsScreen',()=>({NotificationInbox:'Inbox'}));
const {palettes,usePalette,navigationTheme}=require('../src/ui/theme'),{Field,Action}=require('../src/ui/design'),{useAuth}=require('../src/hooks/useAuth'),Root=require('../src/navigation/RootNavigator').default;
const {TextInput,StyleSheet}=require('react-native');
async function appearance(value){await act(async()=>{mockScheme=value;mockListeners.forEach(f=>f());});}
let tree;afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;mockMount.mockClear();});
test.each(['light','dark',null])('system appearance %s selects semantic palette',async scheme=>{mockScheme=scheme;function Sample(){const p=usePalette();return mockReact.createElement('Palette',{p});}await act(async()=>{tree=create(<Sample/>);});expect(tree.root.findByType('Palette').props.p).toBe(palettes[scheme==='dark'?'dark':'light']);expect(navigationTheme(scheme).dark).toBe(scheme==='dark');});
test('appearance subscription updates controls without clearing entered text',async()=>{
 mockScheme='light';function Form(){const [value,setValue]=mockReact.useState('');return <><Field label="Notes" value={value} onChangeText={setValue}/><Action title="Save" onPress={()=>{}}/></>;}
 await act(async()=>{tree=create(<Form/>);});await act(async()=>tree.root.findByType(TextInput).props.onChangeText('Unsent notes'));await appearance('dark');
 const input=tree.root.findByType(TextInput);expect(input.props.value).toBe('Unsent notes');expect(StyleSheet.flatten(input.props.style).backgroundColor).toBe(palettes.dark.inputBackground);expect(input.props.keyboardAppearance).toBe('dark');await appearance(null);expect(StyleSheet.flatten(tree.root.findByType(TextInput).props.style).color).toBe(palettes.light.text);
});
test.each(['patient','doctor'])('%s retains authenticated navigator and active route across appearance changes',async role=>{
 mockScheme='light';const identity={status:'ready',loading:false,user:{uid:'same-user',role,status:'active',verificationStatus:'approved'}};useAuth.mockReturnValue(identity);
 await act(async()=>{tree=create(<Root/>);});await act(async()=>tree.root.findByType('Navigation').props.go());await appearance('dark');expect(tree.root.findByType('Navigation').props.theme.dark).toBe(true);expect(tree.root.findByType('Navigation').props.route).toBe('Details');expect(mockMount).toHaveBeenCalledTimes(1);expect(useAuth()).toBe(identity);await appearance('light');expect(tree.root.findByType('Navigation').props.route).toBe('Details');
});
