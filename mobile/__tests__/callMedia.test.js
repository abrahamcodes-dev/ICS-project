const mockPermission=jest.fn(),mockGetUserMedia=jest.fn();
jest.mock('react-native-webrtc',()=>({permissions:{request:mockPermission},mediaDevices:{getUserMedia:mockGetUserMedia}}));
const {createCallMedia,releaseCallMedia}=require('../src/services/calls/media');
function stream(video=true){const audio={kind:'audio',enabled:true,stop:jest.fn()},camera={kind:'video',enabled:true,stop:jest.fn(),_switchCamera:jest.fn()};
 return {audio,camera,getTracks:()=>video?[audio,camera]:[audio],getAudioTracks:()=>[audio],getVideoTracks:()=>video?[camera]:[],release:jest.fn()};}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
beforeEach(()=>{jest.clearAllMocks();mockPermission.mockResolvedValue(true);});
test('audio asks only microphone permission and does not request camera',async()=>{
 const m=createCallMedia(),s=stream(false);mockGetUserMedia.mockResolvedValue(s);expect(await m.acquire('audio')).toBe(s);
 expect(mockPermission.mock.calls).toEqual([[{name:'microphone'}]]);expect(mockGetUserMedia).toHaveBeenCalledWith({audio:true,video:false});m.clear();
});
test.each(['microphone','camera'])('denied %s does not acquire media',async denied=>{
 mockPermission.mockImplementation(async({name})=>name!==denied);await expect(createCallMedia().acquire('video')).rejects.toMatchObject({reason:'permission'});expect(mockGetUserMedia).not.toHaveBeenCalled();
});
test('cancel while permission prompt is pending prevents capture',async()=>{
 const m=createCallMedia(),d=deferred();mockPermission.mockReturnValue(d.promise);const p=m.acquire('video');m.clear();d.resolve(true);expect(await p).toBeNull();expect(mockGetUserMedia).not.toHaveBeenCalled();
});
test('late native stream after unmount is stopped and released once',async()=>{
 const m=createCallMedia(),d=deferred(),s=stream();mockGetUserMedia.mockReturnValue(d.promise);const p=m.acquire('video');for(let i=0;i<5;i++)await Promise.resolve();m.clear();d.resolve(s);
 expect(await p).toBeNull();releaseCallMedia(s);expect(s.audio.stop).toHaveBeenCalledTimes(1);expect(s.camera.stop).toHaveBeenCalledTimes(1);expect(s.release).toHaveBeenCalledTimes(1);
});
test('partial video grant is rejected and released instead of negotiating audio-only',async()=>{
 const s=stream(false);mockGetUserMedia.mockResolvedValue(s);await expect(createCallMedia().acquire('video')).rejects.toMatchObject({reason:'permission'});expect(s.release).toHaveBeenCalledTimes(1);
});
test('native failure is sanitized',async()=>{
 mockGetUserMedia.mockRejectedValue(new Error('private device details'));await expect(createCallMedia().acquire('audio')).rejects.toMatchObject({reason:'unavailable'});
});
test('mute/camera controls change existing tracks without reacquiring media',async()=>{
 const m=createCallMedia(),s=stream();mockGetUserMedia.mockResolvedValue(s);await m.acquire('video');m.microphone(false);m.camera(false);
 expect(s.audio.enabled).toBe(false);expect(s.camera.enabled).toBe(false);m.microphone(true);m.camera(true);expect(m.switchCamera()).toBe(true);expect(s.camera._switchCamera).toHaveBeenCalledTimes(1);
 expect(mockGetUserMedia).toHaveBeenCalledTimes(1);m.clear();m.clear();expect(s.release).toHaveBeenCalledTimes(1);
});
test('unsupported switching returns false',async()=>{
 const m=createCallMedia(),s=stream(false);mockGetUserMedia.mockResolvedValue(s);await m.acquire('audio');expect(m.switchCamera()).toBe(false);m.clear();
});
