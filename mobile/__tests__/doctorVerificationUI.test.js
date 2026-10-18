const React=require('react'),{act,create}=require('react-test-renderer');
jest.mock('../src/hooks/useAuth',()=>({useAuth:jest.fn()}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('firebase/firestore',()=>({doc:jest.fn(),getDoc:jest.fn()}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('firebase/storage',()=>({ref:jest.fn(),uploadBytesResumable:jest.fn()}));
jest.mock('../src/services/doctorVerification',()=>({
 ...jest.requireActual('../src/services/doctorVerification'),createVerificationSession:jest.fn()
}));
jest.mock('../src/services/firebaseConfig',()=>({auth:{},db:{},functions:{},storage:{}}));
jest.mock('../src/services/identityService',()=>({loadOwnIdentity:jest.fn()}));
const {useAuth}=require('../src/hooks/useAuth');
const {createVerificationSession}=require('../src/services/doctorVerification');
const {getDocumentAsync}=require('expo-document-picker');
const {default:Screen}=require('../src/screens/doctor/SubmitVerificationScreen');
const {Action,Field,Notice}=require('../src/ui/design');
let tree,api,identity;
const profile={uid:'d',revision:1,professionalName:'Dr Example',specialty:'Medicine',registrationNumber:'R',issuingAuthority:'Authority',activeRequestId:null};
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(require('react-native').AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 identity={status:'ready',firebaseUid:'d',user:{role:'doctor',status:'active',verificationStatus:'pending'},refreshIdentity:jest.fn(),logout:jest.fn()};useAuth.mockImplementation(()=>identity);
 api={profile:jest.fn().mockResolvedValue(profile),request:jest.fn(),save:jest.fn(),credential:jest.fn(),finalize:jest.fn(),upload:jest.fn(),submit:jest.fn(),dispose:jest.fn()};createVerificationSession.mockReturnValue(api);
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
async function render(){await act(async()=>{tree=create(<Screen/>);});}
const button=title=>tree.root.findAllByType(Action).find(n=>n.props.title===title);
async function press(title){await act(async()=>button(title).props.onPress());}
async function fill(label,value){await act(async()=>tree.root.findAllByType(Field).find(n=>n.props.label===label).props.onChangeText(value));}
test.each(['patient','administrator'])('%s cannot access submission form',async role=>{identity.user.role=role;await render();expect(createVerificationSession).not.toHaveBeenCalled();});
test.each(['disabled','approved'])('%s doctor cannot enter submission form',async state=>{if(state==='disabled')identity.user.status=state;else identity.user.verificationStatus=state;await render();expect(createVerificationSession).not.toHaveBeenCalled();});
test('draft reload and save use existing service',async()=>{await render();expect(tree.root.findAllByType(Field)[0].props.value).toBe('Dr Example');await fill('Specialty','Surgery');await press('Save draft');expect(api.save).toHaveBeenCalledWith(expect.objectContaining({specialty:'Surgery'}));});
test('invalid phone produces local validation without save',async()=>{await render();await fill('Phone number (optional)','invalid');await press('Save draft');expect(api.save).not.toHaveBeenCalled();expect(tree.root.findByType(Notice).props.message).toMatch(/phone/);});
test('pending submission locks profile and uploads',async()=>{api.profile.mockResolvedValue({...profile,activeRequestId:'r'});api.request.mockResolvedValue({requestId:'r',state:'submitted'});await render();expect(button('Save draft').props.disabled).toBe(true);expect(button('Select and upload credential').props.disabled).toBe(true);expect(button('Submit verification').props.disabled).toBe(true);});
test('rejected known request shows permitted reason without unlocking clinical routes',async()=>{identity.user.verificationStatus='rejected';api.request.mockResolvedValue({requestId:'r',state:'rejected',rejectionReason:'Replace license'});await render();await fill('Verification request recovery ID','r');await press('Read verification request');expect(JSON.stringify(tree.toJSON())).toContain('Replace license');expect(button('Save draft').props.disabled).toBe(false);});
test('picker cancellation performs no upload',async()=>{getDocumentAsync.mockResolvedValue({canceled:true});await render();await press('Select and upload credential');expect(api.upload).not.toHaveBeenCalled();});
test('upload then submit uses saved revision and finalized credentials',async()=>{const record={credentialId:'c',category:'medical_license',state:'ready'};getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///test',mimeType:'application/pdf',size:10}]});api.upload.mockResolvedValue(record);api.submit.mockResolvedValue({requestId:'r'});api.request.mockResolvedValue({requestId:'r',state:'submitted'});await render();await press('Select and upload credential');await press('Submit verification');expect(api.submit).toHaveBeenCalledWith(profile,[record]);});
test('failed finalization can recover by known ID',async()=>{api.credential.mockResolvedValue({credentialId:'c',state:'prepared'});api.finalize.mockResolvedValue({credentialId:'c',state:'ready',category:'medical_license'});await render();await fill('Credential recovery ID','c');await press('Recover credential / retry finalization');expect(api.finalize).toHaveBeenCalledWith('c');});
test('network failure safe and retry possible',async()=>{api.save.mockRejectedValue({message:'sensitive'});await render();await press('Save draft');expect(tree.root.findByType(Notice).props.message).not.toContain('sensitive');expect(button('Save draft').props.disabled).toBe(false);});
test('unmount disposes session while request pending',async()=>{let resolve;api.profile.mockReturnValue(new Promise(r=>resolve=r));await render();await act(async()=>tree.unmount());tree=null;expect(api.dispose).toHaveBeenCalledTimes(1);await act(async()=>resolve(profile));});
