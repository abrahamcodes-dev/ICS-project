const React=require('react'),{act,create}=require('react-test-renderer');
const mockGet=jest.fn(),mockSubmit=jest.fn(),mockSummary=jest.fn(),mockDispose=jest.fn();let mockIdentity;
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentity=fn;return jest.fn();}}));
jest.mock('../src/services/ratingService',()=>({createRatingSession:()=>({get:mockGet,submit:mockSubmit,summary:mockSummary,dispose:mockDispose}),validateRatingInput:(score,comment)=>{if(score===null)throw Error('required');return{score,comment};}}));
const {PatientRating,DoctorRatingSummaryPanel}=require('../src/screens/shared/RatingPanels'),Stars=require('../src/components/RatingStars').default;
const {Action,Field}=require('../src/ui/design');let tree;const cid='a'.repeat(64);
const button=title=>tree.root.findAllByType(Action).find(a=>a.props.title===title),content=()=>JSON.stringify(tree.toJSON());
async function press(title){await act(async()=>button(title).props.onPress());}
async function render(){await act(async()=>{tree=create(<PatientRating uid="p" cid={cid}/>);});}
beforeEach(()=>{jest.clearAllMocks();mockGet.mockReset().mockResolvedValue(null);mockSubmit.mockReset();mockSummary.mockReset().mockResolvedValue({count:0,average:null});jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test('explicit zero selector and confirmation; confirmed response replaces form',async()=>{
 await render();expect(button('Review rating').props.disabled).toBe(true);
 const zero=tree.root.findAll(n=>n.props.accessibilityLabel==='0 out of 5'&&typeof n.props.onPress==='function')[0];
 await act(async()=>zero.props.onPress());await press('Review rating');expect(mockSubmit).not.toHaveBeenCalled();
 mockSubmit.mockResolvedValue({consultationId:cid,score:0,comment:'',createdAt:1});await press('Confirm rating');
 expect(mockSubmit).toHaveBeenCalledWith(cid,0,'');expect(tree.root.findAllByType(Stars)).toHaveLength(0);expect(content()).toContain('Submitted rating');
});
test('uncertain send locks draft and retries; concurrent taps cannot duplicate',async()=>{
 await render();await act(async()=>tree.root.findByType(Stars).props.onChange(5));await press('Review rating');
 let reject;mockSubmit.mockReturnValue(new Promise((_,r)=>{reject=r;}));const click=button('Confirm rating').props.onPress;
 await act(async()=>{click();click();});expect(mockSubmit).toHaveBeenCalledTimes(1);
 await act(async()=>reject(Error('offline')));expect(tree.root.findByType(Field).props.editable).toBe(false);
 mockSubmit.mockRejectedValue(Error('offline'));await press('Retry unchanged rating');
 expect(mockSubmit.mock.calls[0]).toEqual(mockSubmit.mock.calls[1]);
});
test('own previous rating shown, errors retry, session clears and late result ignored',async()=>{
 mockGet.mockRejectedValueOnce(Error('denied'));await render();expect(content()).toContain('Unable to retrieve');
 mockGet.mockResolvedValue({score:3,comment:'Private note',createdAt:1});await press('Refresh my rating');expect(content()).toContain('Private note');
 let resolve;mockGet.mockReturnValue(new Promise(r=>{resolve=r;}));await press('Refresh my rating');await act(async()=>mockIdentity());
 await act(async()=>resolve({score:4,comment:'Late private',createdAt:1}));expect(content()).not.toContain('Private');expect(content()).not.toContain('Late');expect(mockDispose).toHaveBeenCalled();
});
test('unmount disposes pending reads',async()=>{
 let resolve;mockGet.mockReturnValue(new Promise(r=>{resolve=r;}));await render();await act(async()=>tree.unmount());tree=null;
 await act(async()=>resolve(null));expect(mockDispose).toHaveBeenCalled();
});
test('doctor summary supports empty, aggregate, refresh and error without individual review',async()=>{
 await act(async()=>{tree=create(<DoctorRatingSummaryPanel uid="d"/>);});expect(content()).toContain('No submitted ratings');
 mockSummary.mockResolvedValue({count:2,average:2.5});await press('Refresh rating summary');expect(content()).toContain('Average 2.5 / 5');
 mockSummary.mockRejectedValue(Error('offline'));await press('Refresh rating summary');expect(content()).toContain('Unable to load');
 expect(mockGet).not.toHaveBeenCalled();
});
