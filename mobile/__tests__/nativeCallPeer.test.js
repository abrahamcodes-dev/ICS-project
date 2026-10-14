const mockInstances=[];
jest.mock('react-native-webrtc',()=>({RTCPeerConnection:jest.fn().mockImplementation(function(config){
 this.config=config;this.addTrack=jest.fn();this.addTransceiver=jest.fn();this.close=jest.fn();this.createOffer=jest.fn(async()=>({type:'offer',sdp:'v=0\r\n'}));
 this.setLocalDescription=jest.fn(async()=>{});this.setRemoteDescription=jest.fn(async()=>{});this.addIceCandidate=jest.fn(async()=>{});mockInstances.push(this);
})}));
const {createNativePeer}=require('../src/services/calls/nativePeer');
beforeEach(()=>{mockInstances.length=0;jest.clearAllMocks();});
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
