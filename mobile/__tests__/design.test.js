const React=require('react'),{act,create}=require('react-test-renderer');
let mockScheme='light';
jest.mock('react-native',()=>Object.defineProperty(Object.create(jest.requireActual('react-native')),'useColorScheme',{value:()=>mockScheme}));
const {Text,TextInput,Pressable}=require('react-native');
const {Copy,Field,Action,palettes}=require('../src/ui/design');
test.each(['light','dark'])('%s theme uses semantic text color and accessible controls',async scheme=>{
 mockScheme=scheme;let tree;await act(async()=>{tree=create(<><Copy>Care</Copy><Field label="Email"/><Action title="Continue" disabled onPress={jest.fn()}/></>);});
 expect(require('react-native').StyleSheet.flatten(tree.root.findAllByType(Text)[0].props.style).color).toBe(palettes[scheme].text);
 expect(tree.root.findByType(TextInput).props.accessibilityLabel).toBe('Email');
 expect(tree.root.findAll(n=>n.props?.accessibilityRole==='button')[0].props.accessibilityState.disabled).toBe(true);
 await act(async()=>tree.unmount());
});

const {Screen,Card,Status,Notice,Loading}=require('../src/ui/design');
const {ScrollView,StyleSheet,AccessibilityInfo,Animated,View}=require('react-native');
const flat=StyleSheet.flatten;
function contrast(a,b){
 const lum=hex=>{const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
 const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
test.each(['light','dark'])('%s semantic text combinations meet normal-text contrast',scheme=>{
 const c=palettes[scheme];
 for(const surface of [c.background,c.surface])for(const ink of [c.text,c.muted,c.error])expect(contrast(ink,surface)).toBeGreaterThanOrEqual(4.5);
 for(const bg of [c.primary,c.danger])expect(contrast(c.onPrimary,bg)).toBeGreaterThanOrEqual(4.5);
 expect(contrast(c.onDisabled,c.disabled)).toBeGreaterThanOrEqual(4.5);
 for(const ink of [c.text,c.success,c.warning,c.error])expect(contrast(ink,c.mint)).toBeGreaterThanOrEqual(4.5);
 expect(contrast(c.inputBorder,c.surface)).toBeGreaterThanOrEqual(3);
});
test.each(['onboarding','form','dashboard','chat','immersive'])('%s layout preserves content and avoids nested scrolling for media/chat',async variant=>{
 let tree;await act(async()=>{tree=create(<Screen variant={variant} footer={<Copy>Footer</Copy>}><Copy>Content</Copy></Screen>);});
 const scrolls=tree.root.findAllByType(ScrollView);
 expect(scrolls.length).toBe(['chat','immersive'].includes(variant)?0:1);
 if(scrolls.length)expect(flat(scrolls[0].props.contentContainerStyle).justifyContent).toBe(variant==='onboarding'?'center':'flex-start');
 expect(tree.root.findAllByType(Copy).map(n=>n.props.children)).toEqual(['Content','Footer']);
 await act(async()=>tree.unmount());
});
test('default Screen keeps legacy centered scroll layout',async()=>{
 let tree;await act(async()=>{tree=create(<Screen><Copy>Legacy</Copy></Screen>);});
 expect(flat(tree.root.findByType(ScrollView).props.contentContainerStyle).justifyContent).toBe('center');
 await act(async()=>tree.unmount());
});
test('busy action blocks handler and exposes selected/busy state without losing title',async()=>{
 const press=jest.fn();let tree;await act(async()=>{tree=create(<Action title="Confirm" secondary selected loading onPress={press}/>);});
 const button=tree.root.findAll(n=>n.props.accessibilityRole==='button'&&typeof n.props.style==='function')[0];
 expect(button.props.accessibilityState).toEqual({disabled:true,selected:true,busy:true});
 button.props.onPress();expect(press).not.toHaveBeenCalled();
 expect(flat(button.props.style({pressed:false})).minHeight).toBeGreaterThanOrEqual(48);
 await act(async()=>tree.unmount());
});
test('enabled action invokes original handler once',async()=>{
 const press=jest.fn();let tree;await act(async()=>{tree=create(<Action title="Continue" onPress={press}/>);});
 tree.root.findAll(n=>n.props.accessibilityRole==='button'&&typeof n.props.style==='function')[0].props.onPress();expect(press).toHaveBeenCalledTimes(1);
 await act(async()=>tree.unmount());
});
test('field forwards native props/styles and focus handlers with error feedback',async()=>{
 const focus=jest.fn(),blur=jest.fn();let tree;
 await act(async()=>{tree=create(<Field label="Email" value="test" onChangeText={()=>{}} multiline
  style={{minHeight:100}} onFocus={focus} onBlur={blur} error="Check email"/>);});
 const input=tree.root.findByType(TextInput);
 expect(input.props.value).toBe('test');expect(flat(input.props.style).minHeight).toBe(100);
 expect(flat(input.props.style).textAlignVertical).toBe('top');
 await act(async()=>input.props.onFocus({}));await act(async()=>input.props.onBlur({}));
 expect(focus).toHaveBeenCalledTimes(1);expect(blur).toHaveBeenCalledTimes(1);
 expect(tree.root.findByType(Notice).props.message).toBe('Check email');
 expect(input.props.accessibilityHint).toBe('Check email');
 await act(async()=>tree.unmount());
});
test('status is labeled and noninteractive; loading announces busy state',async()=>{
 let tree;await act(async()=>{tree=create(<><Status label="Pending verification" tone="warning"/><Loading label="Loading records"/></>);});
 expect(tree.root.findAll(n=>n.props?.accessibilityRole==='button')).toHaveLength(0);
 expect(tree.root.findAllByType(Text).some(n=>n.props.children==='Pending verification')).toBe(true);
 expect(tree.root.findAllByType(View).some(n=>n.props.accessibilityState?.busy)).toBe(true);
 await act(async()=>tree.unmount());
});
test('Card respects reduced motion and preserves mixed component children',async()=>{
 const reduce=jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 const timing=jest.spyOn(Animated,'timing');let tree;
 await act(async()=>{tree=create(<Card tone="mint"><Copy>Text</Copy><Action title="Continue" onPress={()=>{}}/></Card>);});
 expect(timing).not.toHaveBeenCalled();expect(tree.root.findByType(Action).props.title).toBe('Continue');
 await act(async()=>tree.unmount());reduce.mockRestore();timing.mockRestore();
});
