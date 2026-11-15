const mockInstances=[];
jest.mock('react-native-webrtc',()=>({MediaStream:jest.fn().mockImplementation(function(tracks){this.getTracks=()=>tracks;this.release=jest.fn();}),RTCPeerConnection:jest.fn().mockImplementation(function(config){
 this.config=config;this.addTrack=jest.fn();this.addTransceiver=jest.fn();this.close=jest.fn();this.createOffer=jest.fn(async()=>({type:'offer',sdp:'v=0\r\n'}));
 this.setLocalDescription=jest.fn(async()=>{});this.setRemoteDescription=jest.fn(async()=>{});this.addIceCandidate=jest.fn(async()=>{});mockInstances.push(this);
})}));
const {createNativePeer}=require('../src/services/calls/nativePeer');
beforeEach(()=>{mockInstances.length=0;jest.clearAllMocks();});

test('peer retains ownership when a stable stream getter is cleared by the UI',()=>{
 const track={kind:'audio',stop:jest.fn()},stream={getTracks:()=>[track],release:jest.fn()};let current=stream;
 const peer=createNativePeer('audio',{ice:jest.fn(),connection:jest.fn()},{get localStream(){return current;}});
 expect(mockInstances[0].addTrack).toHaveBeenCalledWith(track,stream);current=undefined;peer.close();
 expect(track.stop).toHaveBeenCalledTimes(1);expect(stream.release).toHaveBeenCalledTimes(1);
});
test('native events strip authority fields and ignore end-of-candidates',()=>{
 const events={ice:jest.fn(),connection:jest.fn()};const peer=createNativePeer('audio',events);const pc=mockInstances[0];
 expect(pc.config).toEqual({iceServers:[]});pc.onicecandidate({candidate:null});pc.onicecandidate({candidate:{candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0,senderId:'forged'}});
 expect(events.ice).toHaveBeenCalledTimes(1);expect(events.ice).toHaveBeenCalledWith({candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0});peer.close();
});
test('cleanup stops owned tracks, releases streams, detaches callbacks and clears remote view exactly once',()=>{
 const tracks=[{kind:'audio',stop:jest.fn()}],stream={getTracks:()=>tracks,release:jest.fn()},remote={release:jest.fn()},onRemoteStream=jest.fn();
 const peer=createNativePeer('audio',{ice:jest.fn(),connection:jest.fn()},{localStream:stream,onRemoteStream});const pc=mockInstances[0],late=pc.ontrack;
 pc.ontrack({streams:[remote]});peer.close();peer.close();late({streams:[remote]});
 expect(tracks[0].stop).toHaveBeenCalledTimes(1);expect(stream.release).toHaveBeenCalledTimes(1);expect(remote.release).toHaveBeenCalledTimes(1);
 expect(onRemoteStream.mock.calls.map(c=>c[0])).toEqual([remote,null]);expect(pc.onicecandidate).toBeNull();expect(pc.close).toHaveBeenCalledTimes(1);
});
test('receive-only video negotiates audio/video without opening devices',()=>{
 const peer=createNativePeer('video',{ice:jest.fn(),connection:jest.fn()});expect(mockInstances[0].addTransceiver.mock.calls).toEqual([['audio',{direction:'recvonly'}],['video',{direction:'recvonly'}]]);peer.close();
});

test('unusable incoming audio is reported without modifying remote mute state or video',()=>{
 const unavailable=jest.fn(),onRemoteStream=jest.fn(),audio={kind:'audio',enabled:false,readyState:'live'},stream={release:jest.fn()};
 const peer=createNativePeer('video',{ice:jest.fn(),connection:jest.fn()},{onRemoteAudioUnavailable:unavailable,onRemoteStream});
 mockInstances[0].ontrack({track:audio,streams:[stream]});expect(unavailable).toHaveBeenCalledTimes(1);
 expect(audio.enabled).toBe(false);expect(onRemoteStream).toHaveBeenCalledWith(stream);peer.close();
});
test('streamless remote audio and video are retained together and released on teardown',()=>{
 const onRemoteStream=jest.fn(),peer=createNativePeer('video',{ice:jest.fn(),connection:jest.fn()},{onRemoteStream});
 const audio={id:'audio',kind:'audio',enabled:true,readyState:'live'},video={id:'video',kind:'video',enabled:true,readyState:'live'};
 mockInstances[0].ontrack({track:video,streams:[]});mockInstances[0].ontrack({track:audio,streams:[]});
 const result=onRemoteStream.mock.calls.at(-1)[0];expect(result.getTracks()).toEqual([video,audio]);peer.close();expect(result.release).toHaveBeenCalledTimes(1);
});
test('development audio sample contains counts only and is cancelled on close',async()=>{
 jest.useFakeTimers();const log=jest.spyOn(console,'info').mockImplementation(()=>{});
 const peer=createNativePeer('audio',{ice:jest.fn(),connection:jest.fn()}),pc=mockInstances[0];
 pc.getStats=jest.fn(async()=>new Map([['out',{type:'outbound-rtp',kind:'audio',packetsSent:25}],['in',{type:'inbound-rtp',kind:'audio',packetsReceived:20}]]));
 pc.getReceivers=()=>[{track:{kind:'audio',readyState:'live',enabled:true}}];pc.connectionState='connected';pc.onconnectionstatechange();
 jest.advanceTimersByTime(5000);await Promise.resolve();expect(log).toHaveBeenCalledWith('[call audio]',{packetsSent:25,packetsReceived:20,liveRemoteAudioTracks:1});
 peer.close();log.mockRestore();jest.useRealTimers();
});
test('closing before diagnostic sampling prevents late native reads',()=>{
 jest.useFakeTimers();const peer=createNativePeer('audio',{ice:jest.fn(),connection:jest.fn()}),pc=mockInstances[0];
 pc.getStats=jest.fn();pc.connectionState='connected';pc.onconnectionstatechange();peer.close();
 jest.advanceTimersByTime(5000);expect(pc.getStats).not.toHaveBeenCalled();jest.useRealTimers();
});
