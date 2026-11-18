jest.mock('expo',()=>({registerRootComponent:jest.fn()}));
jest.mock('../App',()=>({__esModule:true,default:jest.fn(()=>null)}));

test('application-owned entry registers the unchanged local App through Expo',()=>{
 const {registerRootComponent}=require('expo');
 const App=require('../App').default;
 require('../index');
 expect(require('../package.json').main).toBe('index.js');
 expect(registerRootComponent).toHaveBeenCalledTimes(1);
 expect(registerRootComponent).toHaveBeenCalledWith(App);
});
