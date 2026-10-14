let mockEffect, mockAuthNext, mockIdentityNext, mockAppNext;
const mockDispose=jest.fn(),mockStateStop=jest.fn(),mockAuthStop=jest.fn(),mockIdentityStop=jest.fn(),mockAppStop=jest.fn();
jest.mock('react',()=>({...jest.requireActual('react'),useEffect:fn=>{mockEffect=fn;},useState:()=>[null,jest.fn()]}));
jest.mock('react-native',()=>Object.defineProperty(Object.create(jest.requireActual('react-native')),'AppState',
 {value:{addEventListener:(_,fn)=>{mockAppNext=fn;return {remove:mockAppStop};}}}));
jest.mock('firebase/auth',()=>({onAuthStateChanged:(_,fn)=>{mockAuthNext=fn;return mockAuthStop;}}));
jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:{uid:'p'}}}));
jest.mock('../src/services/authService',()=>({onIdentityRefresh:fn=>{mockIdentityNext=fn;return mockIdentityStop;}}));
jest.mock('../src/services/calls/signaling',()=>({callSignaling:{}}));
jest.mock('../src/services/calls/nativePeer',()=>({createNativePeer:jest.fn()}));
jest.mock('../src/services/calls/session',()=>({createCallSession:jest.fn(()=>({subscribe:()=>mockStateStop,dispose:mockDispose}))}));
jest.mock('../src/hooks/useAuth',()=>({useAuth:jest.fn(()=>({status:'ready',firebaseUid:'p',user:{role:'patient',status:'active'}}))}));
const {useConsultationCall}=require('../src/hooks/useConsultationCall');
const {useAuth}=require('../src/hooks/useAuth');
const {createCallSession}=require('../src/services/calls/session');
test('transient inactive permission prompt preserves the session',()=>{
 useConsultationCall('a'.repeat(64),{requestId:jest.fn()});const cleanup=mockEffect();
 mockAppNext('inactive');expect(mockDispose).not.toHaveBeenCalled();cleanup();
});
beforeEach(()=>{jest.clearAllMocks();useAuth.mockReturnValue({status:'ready',firebaseUid:'p',user:{role:'patient',status:'active'}});});
test.each(['logout','account switch','identity refresh','background','unmount'])('%s disposes listeners/session and unclaimed media',cause=>{
 const track={stop:jest.fn()},stream={getTracks:()=>[track],release:jest.fn()};
 useConsultationCall('a'.repeat(64),{requestId:jest.fn(),localStream:stream});const cleanup=mockEffect();
 if(cause==='logout')mockAuthNext(null);
 if(cause==='account switch')mockAuthNext({uid:'other'});
 if(cause==='identity refresh')mockIdentityNext();
 if(cause==='background')mockAppNext('background');
 cleanup();expect(mockDispose).toHaveBeenCalledTimes(1);expect(track.stop).toHaveBeenCalledTimes(1);expect(stream.release).toHaveBeenCalledTimes(1);
 expect(mockStateStop).toHaveBeenCalled();expect(mockAuthStop).toHaveBeenCalled();expect(mockIdentityStop).toHaveBeenCalled();expect(mockAppStop).toHaveBeenCalled();
});
test('administrator cannot create a local call session',()=>{
 useAuth.mockReturnValue({status:'ready',user:{role:'administrator',status:'active'}});useConsultationCall('a'.repeat(64),{requestId:jest.fn()});mockEffect();expect(createCallSession).not.toHaveBeenCalled();
});
test('disabled identity cannot create a local session',()=>{
 useAuth.mockReturnValue({status:'ready',user:{role:'patient',status:'disabled'}});useConsultationCall('a'.repeat(64),{requestId:jest.fn()});mockEffect();expect(createCallSession).not.toHaveBeenCalled();
});
