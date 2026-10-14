const React=require('react'),{act,create}=require('react-test-renderer');
let mockScheme='light';
jest.mock('react-native',()=>Object.defineProperty(Object.create(jest.requireActual('react-native')),'useColorScheme',{value:()=>mockScheme}));
const {Text,TextInput,Pressable}=require('react-native');
const {Copy,Field,Action,palettes}=require('../src/ui/design');
test.each(['light','dark'])('%s theme uses semantic text color and accessible controls',async scheme=>{
 mockScheme=scheme;let tree;await act(async()=>{tree=create(<><Copy>Care</Copy><Field label="Email"/><Action title="Continue" disabled onPress={jest.fn()}/></>);});
 expect(tree.root.findAllByType(Text)[0].props.style.color).toBe(palettes[scheme].text);
 expect(tree.root.findByType(TextInput).props.accessibilityLabel).toBe('Email');
 expect(tree.root.findAll(n=>n.props?.accessibilityRole==='button')[0].props.accessibilityState.disabled).toBe(true);
 await act(async()=>tree.unmount());
});
