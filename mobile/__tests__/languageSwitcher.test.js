const React=require('react'),{act,create}=require('react-test-renderer');
const {Alert,Pressable,StyleSheet,Text}=require('react-native');
const {HeaderShownContext}=require('@react-navigation/elements');
const {LanguageSwitchButton,LanguageSelector,LanguageToolbar}=require('../src/i18n/react');
const {initializeLanguage,setLanguage,getLanguage,LANGUAGE_KEY}=require('../src/i18n/locale');
const {Screen,Copy}=require('../src/ui/design');
let tree,storage,native;
async function mount(node){await act(async()=>{tree=create(node);});}
function button(){return tree.root.findAll(n=>n.props.testID==='language-switch'&&typeof n.props.onPress==='function')[0];}
beforeEach(async()=>{
 storage={getItem:jest.fn(async()=> 'en'),setItem:jest.fn(async()=>{})};native=jest.fn(async()=>false);
 jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 await initializeLanguage(storage,native);await act(async()=>{});jest.clearAllMocks();
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jest.restoreAllMocks();});

test('English displays one blue KIS button with an explicit destination accessibility label',async()=>{
 await mount(<LanguageSelector/>);const b=button();expect(b.props.accessibilityLabel).toBe('Switch to Kiswahili');
 expect(tree.root.findAllByType(LanguageSwitchButton)).toHaveLength(1);expect(JSON.stringify(tree.toJSON())).toContain('"KIS"');
 const style=b.props.style({pressed:false});expect(style).toMatchObject({backgroundColor:'#1266C8',minWidth:56,minHeight:48});
 expect(b.props.accessibilityLanguage).toBe('en-KE');
});
test('switches immediately, persists, synchronizes native locale once and offers EN in Kiswahili',async()=>{
 await mount(<LanguageSwitchButton/>);await act(async()=>button().props.onPress());
 expect(getLanguage()).toBe('sw');expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_KEY,'sw');expect(native).toHaveBeenCalledTimes(1);expect(native).toHaveBeenCalledWith('sw');
 expect(JSON.stringify(tree.toJSON())).toContain('"EN"');expect(button().props.accessibilityLabel).toBe('Badilisha kwenda Kiingereza');
 await act(async()=>button().props.onPress());expect(getLanguage()).toBe('en');expect(storage.setItem).toHaveBeenLastCalledWith(LANGUAGE_KEY,'en');expect(native).toHaveBeenLastCalledWith('en');
});
test('remount and stored preference initialization retain Kiswahili without toggling again',async()=>{
 await mount(<LanguageSwitchButton/>);await act(async()=>button().props.onPress());
 await act(async()=>tree.unmount());tree=null;storage.getItem.mockResolvedValue('sw');
 await initializeLanguage(storage,native);await act(async()=>{});jest.clearAllMocks();await mount(<LanguageSwitchButton/>);
 expect(JSON.stringify(tree.toJSON())).toContain('"EN"');expect(storage.setItem).not.toHaveBeenCalled();expect(native).not.toHaveBeenCalled();
});
test('duplicate presses during persistence are coalesced and cannot cause a switching loop',async()=>{
 let release;storage.setItem.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 await mount(<LanguageSwitchButton/>);const press=button().props.onPress;let pending;
 await act(async()=>{pending=press();void press();});expect(getLanguage()).toBe('sw');expect(button().props.disabled).toBe(true);
 expect(storage.setItem).toHaveBeenCalledTimes(1);expect(native).not.toHaveBeenCalled();
 await act(async()=>{release();await pending;});expect(native).toHaveBeenCalledTimes(1);expect(button().props.disabled).toBe(false);
});
test('storage failure remains truthful, does not recreate Activity and does not expand native header content',async()=>{
 const alert=jest.spyOn(Alert,'alert');storage.setItem.mockRejectedValueOnce(Error('synthetic-write-failure'));
 await mount(<LanguageSwitchButton/>);await act(async()=>button().props.onPress());
 expect(alert).toHaveBeenCalledWith('Lugha unayopendelea','Lugha imebadilishwa, lakini haijahifadhiwa. Jaribu tena.');
 expect(native).not.toHaveBeenCalled();expect(button().props.disabled).toBe(false);expect(tree.root.findAllByType(LanguageSwitchButton)).toHaveLength(1);
});
test('native headers own the button; fallback Screen/selector controls are suppressed',async()=>{
 await mount(<HeaderShownContext.Provider value={true}><LanguageSwitchButton/><Screen><Copy>Content</Copy><LanguageSelector/></Screen></HeaderShownContext.Provider>);
 expect(tree.root.findAllByType(LanguageSwitchButton)).toHaveLength(1);
 expect(tree.root.findAllByProps({testID:'language-toolbar'})).toHaveLength(0);
});
test.each(['dashboard','form','chat'])('headerless %s reserves an in-flow toolbar with one button',async variant=>{
 await mount(<HeaderShownContext.Provider value={false}><Screen variant={variant}><Copy>Content</Copy></Screen></HeaderShownContext.Provider>);
 expect(tree.root.findAllByType(LanguageSwitchButton)).toHaveLength(1);
 const toolbar=tree.root.findByProps({testID:'language-toolbar'});expect(StyleSheet.flatten(toolbar.props.style).position).toBeUndefined();
});
test('immersive call surfaces do not gain a potentially disruptive locale action',async()=>{
 await mount(<Screen variant="immersive"><Copy>Call</Copy></Screen>);expect(tree.root.findAllByType(LanguageSwitchButton)).toHaveLength(0);
});
