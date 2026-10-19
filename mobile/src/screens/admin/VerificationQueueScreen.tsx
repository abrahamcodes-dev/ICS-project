import React, {useContext, useEffect, useRef, useState} from 'react';
import {AppState, Image, Modal, View} from 'react-native';
import Pdf from 'react-native-pdf';
import {AuthContext} from '../../context/AuthContext';
import {Action, Card, Copy, Field, Loading, Notice, Screen, usePalette} from '../../ui/design';
import {adminVerificationError, createAdminVerificationSession, type PrivateCredential} from '../../services/adminVerification';
import type {VerificationQueueItem} from '@shared/types/verificationQueue';

export default function VerificationQueueScreen() {
  const account = useContext(AuthContext);
  if (account.status !== 'ready' || account.user?.role !== 'administrator' || account.user.status !== 'active')
    return <Screen><Notice message="An active administrator account is required." /></Screen>;
  return <Dashboard key={account.user.uid} uid={account.user.uid} logout={account.logout} />;
}
function Dashboard({uid, logout}: {uid: string; logout(): Promise<void>}) {
  const colors = usePalette();
  const api = useRef<ReturnType<typeof createAdminVerificationSession> | null>(null);
  const active = useRef(false), locked = useRef(false), viewerGeneration = useRef(0);
  const [items, setItems] = useState<VerificationQueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<VerificationQueueItem | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null);
  const [reason, setReason] = useState(''), [confirm, setConfirm] = useState<'approved' | 'rejected' | null>(null);
  const [viewer, setViewer] = useState<PrivateCredential | null>(null), [opening, setOpening] = useState(false);
  function closeViewer() {
    ++viewerGeneration.current; setViewer(null); setOpening(false); void api.current?.closeCredential();
  }
  async function load(after?: string) {
    if (locked.current || !api.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      const page = await api.current.queue(after);
      if (!active.current) return;
      setItems(previous => after ? [...new Map([...previous, ...page.items].map(item => [item.requestId, item])).values()] : page.items);
      setCursor(page.nextCursor);
    } catch (e) { if (active.current) setError(adminVerificationError(e)); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true; api.current = createAdminVerificationSession(uid); void load();
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') closeViewer(); });
    return () => { active.current = false; ++viewerGeneration.current; listener.remove(); api.current?.dispose(); api.current = null; };
  }, [uid]);
  async function openDocument(id: string) {
    if (!selected || busy || !api.current) return;
    const version = ++viewerGeneration.current; setViewer(null); setOpening(true); setError(null);
    try {
      const file = await api.current.openCredential(selected, id);
      if (active.current && version === viewerGeneration.current) setViewer(file);
    } catch (e) { if (active.current && version === viewerGeneration.current) setError(adminVerificationError(e)); }
    finally { if (active.current && version === viewerGeneration.current) setOpening(false); }
  }
  async function decide() {
    if (!selected || !confirm || locked.current || !api.current) return;
    if (confirm === 'rejected' && (!reason.trim() || reason.trim().length > 1000 || /[\u0000-\u001f\u007f]/.test(reason))) {
      setError('Enter a rejection reason of 1–1000 characters without control characters.'); return;
    }
    locked.current = true; setBusy(true); setError(null); closeViewer();
    try {
      await api.current.review(selected, confirm === 'approved' ? {decision: 'approved'} : {decision: 'rejected', rejectionReason: reason.trim()});
      if (!active.current) return;
      setItems(rows => rows.filter(row => row.requestId !== selected.requestId)); setSelected(null); setConfirm(null); setReason('');
      setSuccess(confirm === 'approved' ? 'Doctor verification approved.' : 'Doctor verification rejected. The reason is available to the doctor.');
    } catch (e) { if (active.current) setError(adminVerificationError(e)); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  return <Screen>
    <Copy title>Doctor verification</Copy>
    <Copy>Review professional details and supporting evidence before making a decision.</Copy>
    <Notice message={error} />
    {success && <Copy accessibilityLiveRegion="polite">{success}</Copy>}
    {busy && <Loading label="Loading verification information…" />}
    {selected ? <Card>
      <Copy title>{selected.professional.professionalName}</Copy>
      <Copy>Specialty: {selected.professional.specialty}</Copy>
      <Copy>Registration: {selected.professional.registrationNumber}</Copy>
      <Copy>Issuing authority: {selected.professional.issuingAuthority}</Copy>
      <Copy>Submitted: {new Date(selected.submittedAt.seconds * 1000).toLocaleString()}</Copy>
      <Copy>Profile revision: {selected.profileRevision}</Copy>
      <Copy>Request: {selected.requestId}</Copy>
      {selected.credentials.map((credential, i) => <Action key={credential.credentialId}
        title={`View ${credential.category.replace(/_/g, ' ')} (${i + 1})`} secondary disabled={busy || opening}
        onPress={() => {void openDocument(credential.credentialId);}} />)}
      {opening && <Loading label="Downloading selected credential securely…" />}
      {opening && <Action title="Cancel document download" secondary onPress={closeViewer} />}
      <Field label="Rejection reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!busy} />
      {confirm ? <>
        <Copy>{confirm === 'approved' ? 'Approve this doctor and publish their verified professional profile?' : 'Reject this submission with the reason shown above?'}</Copy>
        <Action title={confirm === 'approved' ? 'Confirm approval' : 'Confirm rejection'} danger={confirm === 'rejected'} disabled={busy || opening} onPress={() => {void decide();}} />
        <Action title="Cancel decision" secondary disabled={busy} onPress={() => setConfirm(null)} />
      </> : <>
        <Action title="Approve doctor" disabled={busy || opening} onPress={() => setConfirm('approved')} />
        <Action title="Reject submission" danger disabled={busy || opening} onPress={() => setConfirm('rejected')} />
      </>}
      <Action title="Back to queue" secondary disabled={busy} onPress={() => {closeViewer(); setSelected(null); setReason(''); setConfirm(null); setError(null);}} />
    </Card> : <>
      <Action title="Refresh queue" disabled={busy} onPress={() => {setSuccess(null); void load();}} />
      {!busy && !items.length && !error && <Card><Copy>No pending verification requests.</Copy></Card>}
      {items.map(item => <Card key={item.requestId}>
        <Copy title>{item.professional.professionalName}</Copy><Copy>{item.professional.specialty}</Copy>
        <Copy>{item.credentials.length} credential(s) · Revision {item.profileRevision}</Copy>
        <Action title={`Review ${item.professional.professionalName}`} disabled={busy} onPress={() => {setSelected(item); setSuccess(null); setError(null);}} />
      </Card>)}
      {cursor && <Action title="Load more requests" secondary disabled={busy} onPress={() => {void load(cursor);}} />}
    </>}
    <Action title="Sign out" secondary disabled={busy} onPress={() => {closeViewer(); api.current?.dispose(); void logout().catch(e => {if(active.current)setError(adminVerificationError(e));});}} />
    <Modal visible={viewer !== null} onRequestClose={closeViewer} animationType="slide">
      <View style={{flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 48}}>
        <Copy title>Private credential</Copy>
        {viewer?.contentType === 'application/pdf' ? <Pdf style={{flex: 1, width: '100%'}} source={{uri: viewer.uri, cache: false}} trustAllCerts={false}
          enableAnnotationRendering={false} onError={() => {closeViewer(); setError('Unable to render this PDF on this device. No review decision was made.');}} />
          : viewer && <Image accessibilityLabel="Selected doctor credential" source={{uri: viewer.uri}} style={{flex: 1, width: '100%'}} resizeMode="contain"
            onError={() => {closeViewer(); setError('Unable to display this image. No review decision was made.');}} />}
        <Action title="Close credential" onPress={closeViewer} />
      </View>
    </Modal>
  </Screen>;
}
