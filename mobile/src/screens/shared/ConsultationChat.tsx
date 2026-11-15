import React, { useEffect, useRef, useState } from 'react';
import {ConsultationAttachmentComposer,ConsultationAttachmentViewer} from './ConsultationAttachments';
import type {ConsultationAttachment} from '@shared/types/consultationAttachments';
import { uuid } from 'expo-modules-core';
import { Action, Card, Copy, Field, Loading, Notice, Status } from '../../ui/design';
import { onIdentityRefresh } from '../../services/authService';
import { createConsultationMessageSession, sendConsultationMessage,
  type ConsultationView, type ConsultationMessageView, type MessageCursor } from '../../services/consultationService';

/** Mounted only inside the authorized appointment gate; server authorization remains authoritative. */
export default function ConsultationChat({ room, uid }: { room: ConsultationView; uid: string }) {
  const [messages, setMessages] = useState<ConsultationMessageView[]>([]);
  const [attachment,setAttachment]=useState<ConsultationAttachment|null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [readingError, setReadingError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [sending, setSending] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<ReturnType<typeof createConsultationMessageSession> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const paging = useRef(false);
  const intent = useRef<{ consultationId: string; messageRequestId: string; text: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    const current = createConsultationMessageSession(); session.current = current;
    function close() {
      alive.current = false; current.dispose(); session.current = null;
      intent.current = null; setMessages([]); setText(''); setNotice(null); setAttachment(null); setBlocked(true);
    }
    const stopIdentity = onIdentityRefresh(close);
    current.start(room.consultationId, rows => {
      if (!alive.current) return;
      setMessages([...rows].reverse()); setLoading(false); setReadingError(false);
    }, () => { if (alive.current) { setLoading(false); setReadingError(true); } });
    return () => { alive.current = false; current.dispose(); stopIdentity(); session.current = null; intent.current = null; };
  }, [room.consultationId, uid]);

  async function older() {
    if (!alive.current || paging.current || !messages.length) return;
    paging.current = true; setOlderBusy(true);
    const first = messages[0];
    const cursor: MessageCursor = { createdAt: first.createdAtTimestamp, messageId: first.messageId };
    try {
      const page = await session.current?.loadOlder(cursor);
      if (alive.current && page) { setExhausted(page.messages.length < 30); setReadingError(false); }
    } catch { if (alive.current) setReadingError(true); }
    finally { paging.current = false; if (alive.current) setOlderBusy(false); }
  }
  function retryReads() {
    if (!alive.current) return;
    setLoading(true); setReadingError(false); setExhausted(false);
    session.current?.start(room.consultationId, rows => {
      if (alive.current) { setMessages([...rows].reverse()); setLoading(false); }
    }, () => { if (alive.current) { setReadingError(true); setLoading(false); } });
  }
  async function send() {
    if (!alive.current || busy.current || (!intent.current && (!text.trim() || !room.canSend))) return;
    if (!intent.current) intent.current = { consultationId: room.consultationId, messageRequestId: uuid.v4(), text };
    busy.current = true; setSending(true); setSendError(false); setNotice(null);
    try {
      const result = await sendConsultationMessage(intent.current);
      if (!alive.current) return;
      if (result.consultationId !== room.consultationId || result.senderId !== uid || result.type !== 'text') throw new Error('Invalid acknowledgment');
      intent.current = null; setText(''); setNotice('Message acknowledged by the server. History updates when connected.');
    } catch {
      if (alive.current) {
        setSendError(true);
        setNotice('Send not confirmed. It may already be saved, or access, timing or rate limits may prevent sending. Retry the same message to check safely.');
      }
    } finally { busy.current = false; if (alive.current) setSending(false); }
  }
  if (blocked) return <Card><Copy>Session changed. Reopen the consultation to continue.</Copy></Card>;
  return <Card>
    <Copy variant="heading">Consultation messages</Copy><Status label={room.canSend?'Private conversation':'Read-only history'}/>
    <Copy>Messages are private to the appointment participants. History may be cached while offline.</Copy>
    {loading && <Loading label="Loading messages..." />}
    {readingError && <><Notice message="Unable to refresh message history. Check your connection and access." /><Action title="Retry message history" onPress={retryReads} /></>}
    {!loading && !messages.length && <Copy>No messages loaded yet.</Copy>}
    {messages.length > 0 && !exhausted && <Action title={olderBusy ? 'Loading older messages...' : 'Load older messages'} disabled={olderBusy} onPress={() => { void older(); }} />}
    {messages.map(message => <Card key={message.messageId} tone={message.senderId===uid?'mint':'surface'} style={{alignSelf:message.senderId===uid?'flex-end':'flex-start',maxWidth:'92%',borderBottomRightRadius:message.senderId===uid?6:24,borderBottomLeftRadius:message.senderId===uid?24:6}}>
      <Copy variant="caption" tone="muted">{message.senderId === uid ? 'You' : message.senderId === room.doctorId ? 'Doctor' : 'Patient'} · {new Date(message.createdAt).toLocaleString()}</Copy>
      {message.type==='attachment'&&message.attachment?<><Copy>{message.attachment.contentType==='application/pdf'?'PDF document':'Image document'}</Copy><Copy numberOfLines={3}>{message.attachment.filename}</Copy><Copy tone="muted">{Math.ceil(message.attachment.sizeBytes/1024)} KiB · Shared</Copy><Action secondary title="View private document" onPress={()=>setAttachment(message.attachment!)}/></>:<Copy selectable>{message.text}</Copy>}
    </Card>)}
    {!room.canSend && <Copy>This consultation is not available for new messages.</Copy>}
    <Field label="Message" multiline placeholder="Type a message..." maxLength={4000} value={text} editable={!sending && !sendError && room.canSend} onChangeText={setText} />
    <Notice message={notice} />
    <Action title={sending ? 'Sending...' : sendError ? 'Retry same message' : 'Send message'} disabled={sending || (!sendError && (!text.trim() || !room.canSend))} onPress={() => { void send(); }} />
    {sendError && <Copy>The pending text stays unchanged for safe retries. Leaving discards its retry key; check history before composing it again.</Copy>}
    <ConsultationAttachmentComposer room={room} uid={uid}/>
    {attachment&&<ConsultationAttachmentViewer room={room} uid={uid} attachment={attachment} onClose={()=>setAttachment(null)}/>}
  </Card>;
}
