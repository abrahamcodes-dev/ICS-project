const mockManager = {start:jest.fn(),stop:jest.fn(),setForceSpeakerphoneOn:jest.fn()};
jest.mock('react-native-incall-manager',()=>({__esModule:true,default:mockManager}));
const {DeviceEventEmitter,NativeModules,Platform}=require('react-native');
const {startCallAudio}=require('../src/services/calls/audio');
let session;
beforeEach(()=>{jest.clearAllMocks();Platform.OS='android';NativeModules.InCallManager={setForceSpeakerphoneOn:jest.fn()};});
afterEach(()=>{session?.stop();session=undefined;});
test.each(['audio','video'])('%s establishes automatic native routing and restores once',mode=>{
 session=startCallAudio(mode,jest.fn());expect(mockManager.start).toHaveBeenCalledWith({media:mode,auto:true});
 session.stop();session.stop();expect(mockManager.stop).toHaveBeenCalledTimes(1);
});
test('speaker override can return to automatic route without restarting capture',()=>{
 session=startCallAudio('video',jest.fn());session.speaker(true);session.speaker(false);session.speaker(null);
 expect(mockManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(true);
 expect(mockManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
 expect(NativeModules.InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(0);
 session.stop();session.speaker(true);expect(mockManager.setForceSpeakerphoneOn).toHaveBeenCalledTimes(2);
});
test.each([-1,-2])('focus interruption %s is reported; listener is removed on stop',eventCode=>{
 const interrupt=jest.fn();session=startCallAudio('audio',interrupt);
 DeviceEventEmitter.emit('onAudioFocusChange',{eventCode});expect(interrupt).toHaveBeenCalledTimes(1);
 session.stop();DeviceEventEmitter.emit('onAudioFocusChange',{eventCode});expect(interrupt).toHaveBeenCalledTimes(1);
});
test.each([1,-3])('focus gain/duck (%s) does not resume or interrupt capture',eventCode=>{
 const interrupt=jest.fn();session=startCallAudio('audio',interrupt);
 DeviceEventEmitter.emit('onAudioFocusChange',{eventCode});expect(interrupt).not.toHaveBeenCalled();
});
test('replacement session cannot be stopped by stale cleanup',()=>{
 const old=startCallAudio('audio',jest.fn());
 expect(()=>startCallAudio('video',jest.fn())).toThrow('already in use');
 expect(mockManager.stop).not.toHaveBeenCalled();old.stop();session=startCallAudio('video',jest.fn());
 old.stop();expect(mockManager.stop).toHaveBeenCalledTimes(1);
 session.stop();expect(mockManager.stop).toHaveBeenCalledTimes(2);
});
test('native start failure releases ownership and propagates failure',()=>{
 mockManager.start.mockImplementationOnce(()=>{throw Error('native failure');});
 expect(()=>startCallAudio('audio',jest.fn())).toThrow('native failure');expect(mockManager.stop).toHaveBeenCalledTimes(1);
});
