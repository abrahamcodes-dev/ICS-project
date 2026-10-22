import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {Action as Button,Copy as Text,Screen,Card,Loading,Notice} from '../../ui/design';
import { uuid } from 'expo-modules-core';
import type { MediaStream } from 'react-native-webrtc';
import type { CallMode } from '@shared/types/consultationCallContracts';
import { useAuth } from '../../hooks/useAuth';
import { useConsultationCall } from '../../hooks/useConsultationCall';
import { openConsultation, type ConsultationView } from '../../services/consultationService';
import ConsultationChat from './ConsultationChat';
import { CallMediaError, createCallMedia } from '../../services/calls/media';
import { discoverConsultationCalls } from '../../services/calls/discovery';
import type { CallSessionState } from '../../services/calls/session';

export function callStatus(state: CallSessionState) {
  if (state.error === 'expired' || ['expired','ring_timeout'].includes(state.call?.endReason ?? '')) return 'Expired';
  if (state.call?.endReason === 'rejected') return 'Rejected';
  const labels: Record<CallSessionState['phase'], string> = {idle:'Ready',loading:'Connecting',starting:'Connecting',
    ringing:'Ringing',accepting:'Connecting',connecting:'Connecting',connected:'Connected',ending:'Ending',
    ended:'Ended',error:'Failed',disposed:'Ended'};
  return labels[state.phase];
}

export type ConsultationCallRoute = { params?: { appointmentId?: string } };
/** Existing patient/doctor routes supply the appointment ID; IDs never confer authorization. */
export default function ConsultationCallScreen({route}: {route?: ConsultationCallRoute}) {
  const focused = useIsFocused();
  const identity = useAuth();
  const appointmentId = route?.params?.appointmentId;
  if (!focused) return null; // Native stacks retain blurred screens: unmount all call resources on blur.
  if (identity.status !== 'ready' || identity.user?.status !== 'active'
    || !['patient','doctor'].includes(identity.user.role)) return <Screen><Text>Sign in with an active patient or doctor account.</Text></Screen>;
  if (!appointmentId || !/^[a-f0-9]{64}$/.test(appointmentId)) return <Screen><Text>Open a scheduled appointment to enter its consultation.</Text></Screen>;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return <Screen><Text>Calls require an Android or iOS development build.</Text></Screen>;
  return <ConsultationGate key={`${identity.firebaseUid}:${appointmentId}`} appointmentId={appointmentId} uid={identity.firebaseUid!} />;
}

function ConsultationGate({appointmentId, uid}: {appointmentId: string; uid: string}) {
  const [room, setRoom] = useState<ConsultationView | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  useEffect(() => {
    let active = true; setError(false); setRoom(null);
    void openConsultation(appointmentId).then(result => {
      if (!active) return;
      if (!['active','closed'].includes(result.state) || (result.state === 'closed' && result.canSend)
        || result.consultationId !== appointmentId
        || ![result.patientId,result.doctorId].includes(uid)) { setError(true); return; }
      setRoom(result);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [appointmentId, uid, attempt]);
  if (error) return <Screen><Card><Text>Unable to open this consultation. Check your connection, appointment time and eligibility.</Text>
    <Button title="Retry opening consultation" onPress={() => setAttempt(v => v + 1)} /></Card></Screen>;
  if (!room) return <Screen><Loading label="Opening consultation..."/></Screen>;
  if (room.state === 'closed') return <Screen><Text title>Consultation history</Text>
    <Text>This consultation has ended. Calls and new messages are unavailable.</Text>
    <ConsultationChat room={room} uid={uid} /></Screen>;
  return <CallRoom consultationId={room.consultationId} uid={uid} restart={() => setSessionKey(v => v + 1)} key={sessionKey} chatRoom={room} />;
}

/** Shared interface; all role and appointment authority remains in the backend. */
export function CallRoom({consultationId, uid, restart, chatRoom}: {consultationId: string; uid: string; restart(): void; chatRoom?: ConsultationView}) {
  const media = useMemo(() => createCallMedia(), []);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(true);
  const [front, setFront] = useState(true);
  const [background, setBackground] = useState(AppState.currentState === 'background');
  const [discovery, setDiscovery] = useState<'checking' | 'ready' | 'occupied' | 'error'>('checking');
  const [refresh, setRefresh] = useState(0);
  const options = useMemo(() => ({
    requestId: () => uuid.v4(),
    get localStream() { return media.stream ?? undefined; },
    onRemoteStream(stream: MediaStream | null) { if (alive.current) setRemote(stream); },
  }), [media]);
  const {session, state} = useConsultationCall(consultationId, options);
  const terminal = ['ended','error','disposed'].includes(state.phase);
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'background') { media.clear(); setLocal(null); setRemote(null); setBackground(true); }
    });
    return () => { alive.current = false; media.clear(); subscription.remove(); };
  }, [media]);
  useEffect(() => {
    if (terminal) { media.clear(); setLocal(null); setRemote(null); }
  }, [terminal, media]);
  useEffect(() => {
    if (!session || state.phase !== 'idle' || busy || background) return;
    setDiscovery('checking');
    return discoverConsultationCalls(consultationId, call => {
      if (!alive.current || busyRef.current) return;
      if (!call || call.state === 'ended') { setDiscovery('ready'); return; }
      if (![call.initiatorId,call.recipientId].includes(uid)) { setDiscovery('error'); return; }
      setDiscovery('occupied');
      if (call.state === 'ringing') void session.load(call.callId);
    }, () => { if (alive.current) setDiscovery('error'); });
  }, [consultationId, uid, session, state.phase, busy, background, refresh]);

  async function withMedia(mode: CallMode, accept: boolean) {
    if (!session || busyRef.current || terminal || background) return;
    busyRef.current = true; setBusy(true); setMessage(null); setPermissionDenied(false);
    try {
      const stream = await media.acquire(mode);
      if (!stream || !alive.current) return;
      setLocal(stream); setMicrophone(true); setCamera(true); setFront(true);
      if (accept) await session.accept(); else await session.start(mode);
    } catch(e) {
      if (alive.current) {
        setMessage(e instanceof CallMediaError ? e.message : 'Unable to prepare this call.');
        setPermissionDenied(e instanceof CallMediaError && e.reason === 'permission');
      }
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  function end() { media.clear(); setLocal(null); setRemote(null); if (state.call) void session?.end(); else session?.dispose(); }
  const incoming = state.phase === 'ringing' && state.call?.recipientId === uid;
  const canStart = state.phase === 'idle' && discovery === 'ready' && !!session && !busy && !background;
  const RTCView = (local || remote) ? (require('react-native-webrtc') as typeof import('react-native-webrtc')).RTCView : null;
  return <Screen>
    {chatRoom && <ConsultationChat key={`${uid}:${consultationId}`} room={chatRoom} uid={uid} />}
    <Text title>Consultation call</Text>
    <Text accessibilityLiveRegion="polite">{busy ? 'Preparing microphone and camera…' : callStatus(state)}</Text>
    {background && <Text>The call stopped when the app moved to the background. Reopen the consultation when ready.</Text>}
    {state.phase === 'idle' && discovery === 'checking' && <Text>Checking for an incoming call…</Text>}
    {state.phase === 'idle' && discovery === 'occupied' && <Text>A call is already active. It cannot be resumed on this device.</Text>}
    {discovery === 'error' && state.phase === 'idle' && <View><Text>Unable to check for calls. Check your connection and access.</Text>
      <Button title="Retry checking calls" onPress={() => setRefresh(v => v + 1)} /></View>}
    <Notice message={message}/>
    {permissionDenied && <Button title="Open device settings" onPress={() => { void Linking.openSettings().catch(() => setMessage('Unable to open device settings.')); }} />}
    {state.phase === 'error' && <Text>The call could not continue. Check your connection and consultation eligibility before trying again.</Text>}
    {incoming && <Card><Text title>Incoming {state.call?.mode === 'video' ? 'video' : 'audio'} call</Text><Text>Your consultation participant is calling. Accept when you are ready.</Text></Card>}
    {state.phase === 'ringing' && !incoming && <Text>Calling your consultation participant. Waiting for an answer...</Text>}
    {['starting','accepting','connecting'].includes(state.phase) && <Loading label="Establishing a connection..."/>}
    {state.phase === 'idle' && <View style={styles.controls}>
      <Button title="Start audio call" disabled={!canStart} onPress={() => { void withMedia('audio', false); }} />
      <Button title="Start video call" disabled={!canStart} onPress={() => { void withMedia('video', false); }} />
    </View>}
    {incoming && <View style={styles.controls}>
      <Button title="Accept call" disabled={busy || background} onPress={() => { void withMedia(state.call!.mode, true); }} />
      <Button danger title="Reject call" onPress={end} />
    </View>}
    {RTCView && remote && remote.getVideoTracks().length > 0 && <View><Text>Remote video</Text>
      <RTCView testID="remote-video" streamURL={remote.toURL()} accessibilityLabel="Remote participant video" style={styles.video} objectFit="contain" /></View>}
    {RTCView && local && local.getVideoTracks().length > 0 && camera && <View><Text>Your video</Text>
      <RTCView testID="local-video" streamURL={local.toURL()} accessibilityLabel="Your camera preview" style={styles.preview} mirror={front} objectFit="cover" /></View>}
    {local && !terminal && <View style={styles.controls}>
      <Button title={microphone ? 'Mute microphone' : 'Unmute microphone'} onPress={() => { media.microphone(!microphone); setMicrophone(!microphone); }} />
      {local.getVideoTracks().length > 0 && <>
        <Button title={camera ? 'Disable camera' : 'Enable camera'} onPress={() => { media.camera(!camera); setCamera(!camera); }} />
        <Button title="Switch camera" disabled={!camera} onPress={() => {
          if (media.switchCamera()) setFront(v => !v); else setMessage('Camera switching is unavailable on this device.');
        }} />
      </>}
    </View>}
    {!terminal && (busy || !['idle','loading'].includes(state.phase)) && !incoming &&
      <Button danger title="End call" disabled={state.phase === 'ending'} onPress={end} />}
    {terminal && <Button title="Check for another call" onPress={restart} />}
  </Screen>;
}
const styles = StyleSheet.create({
  controls:{gap:12},video:{width:'100%',aspectRatio:0.8,minHeight:240,backgroundColor:'#142C28',borderRadius:20},preview:{width:'40%',aspectRatio:0.8,alignSelf:'flex-end',backgroundColor:'#142C28',borderRadius:16}});
