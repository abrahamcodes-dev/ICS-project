import {systemMessage} from "../../i18n/translate";
import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React, { useEffect, useRef, useState } from 'react';
import {ConsultationAttachmentComposer,ConsultationAttachmentViewer} from './ConsultationAttachments';
import type {ConsultationAttachment} from '@shared/types/consultationAttachments';
import { uuid } from 'expo-modules-core';
import { Action, Card, Copy, Field, Loading, Notice, Status } from '../../ui/design';
import { onIdentityRefresh } from '../../services/authService';
import {classifyHistoryFailure,type HistoryFailure} from '../../services/consultationFeedback';
import { createConsultationMessageSession, sendConsultationMessage,
  type ConsultationView, type ConsultationMessageView, type MessageCursor } from '../../services/consultationService';

/** Mounted only inside the authorized appointment gate; server authorization remains authoritative. */
export default function ConsultationChat({ room, uid, readOnly = false }: { room: ConsultationView; uid: string; readOnly?: boolean }) {
  useLocale();
  const [messages, setMessages] = useState<ConsultationMessageView[]>([]);
  const [attachment,setAttachment]=useState<ConsultationAttachment|null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [readingError, setReadingError] = useState<HistoryFailure|null>(null);
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
    let starting=true;
    current.start(room.consultationId, rows => {
      if (!alive.current) return;
      // The session clears its cache synchronously before attaching the SDK
      // listener. That reset is not an empty, synchronized server history.
      if(starting&&!rows.length)return;
      setMessages([...rows].reverse()); setLoading(false); setReadingError(null);
    }, error => { if (alive.current) { setLoading(false); setReadingError(classifyHistoryFailure(error)); } });
    starting=false;
    return () => { alive.current = false; current.dispose(); stopIdentity(); session.current = null; intent.current = null; };
  }, [room.consultationId, uid]);

  async function older() {
    if (!alive.current || paging.current || !messages.length) return;
    paging.current = true; setOlderBusy(true);
    const first = messages[0];
    const cursor: MessageCursor = { createdAt: first.createdAtTimestamp, messageId: first.messageId };
    try {
      const page = await session.current?.loadOlder(cursor);
      if (alive.current && page) { setExhausted(page.messages.length < 30); setReadingError(null); }
    } catch(error) { if (alive.current) setReadingError(classifyHistoryFailure(error)); }
    finally { paging.current = false; if (alive.current) setOlderBusy(false); }
  }
  function retryReads() {
    if (!alive.current) return;
    setLoading(true); setReadingError(null); setExhausted(false);
    let starting=true;
    session.current?.start(room.consultationId, rows => {
      if(starting&&!rows.length)return;
      if (alive.current) { setMessages([...rows].reverse()); setLoading(false); setReadingError(null); }
    }, error => { if (alive.current) { setReadingError(classifyHistoryFailure(error)); setLoading(false); } });
    starting=false;
  }
  async function send() {
    if (readOnly || !alive.current || busy.current || (!intent.current && (!text.trim() || !room.canSend))) return;
    if (!intent.current) intent.current = { consultationId: room.consultationId, messageRequestId: uuid.v4(), text };
    busy.current = true; setSending(true); setSendError(false); setNotice(null);
    try {
      const result = await sendConsultationMessage(intent.current);
      if (!alive.current) return;
      if (result.consultationId !== room.consultationId || result.senderId !== uid || result.type !== 'text') throw new Error(tr("Invalid acknowledgment"));
      intent.current = null; setText(''); setNotice(tr('Message sent.'));
    } catch {
      if (alive.current) {
        setSendError(true);
        setNotice(tr("Send not confirmed. It may already be saved, or access, timing or rate limits may prevent sending. Retry the same message to check safely."));
      }
    } finally { busy.current = false; if (alive.current) setSending(false); }
  }
  const historyNotice=readingError==='access'?tr('Message history access was denied. Refresh your account status.')
    :readingError==='rules-limit'?tr('Message history exceeded a server Rules limit. Contact the project administrator.')
    :readingError==='index'?tr('Message history requires a server index. Contact the project administrator.')
    :readingError==='service-limit'?tr('Message history reached a service limit. Please retry later.')
    :readingError==='connection'?tr('Message history could not connect. Your saved messages have not been deleted.')
    :readingError==='data'?tr('Message history could not be validated. Refresh before continuing.')
    :tr('Unable to refresh message history. Check your connection and access.');
  if (blocked) return <Card><Copy>{tr("Session changed. Reopen the consultation to continue.")}</Copy></Card>;
  return <Card>
    <Copy variant="heading">{tr("Consultation messages")}</Copy><Status label={!readOnly && room.canSend?tr("Private conversation"):tr("Read-only history")}/>
    <Copy>{tr("Messages are private to the appointment participants. History may be cached while offline.")}</Copy>
    {loading && <Loading label={tr("Loading messages...")} />}
    {readingError && <><Notice message={historyNotice} /><Action title={tr("Retry message history")} onPress={retryReads} /></>}
    {!loading && !readingError && !messages.length && <Copy>{tr("No messages loaded yet.")}</Copy>}
    {messages.length > 0 && !exhausted && <Action title={olderBusy ? tr("Loading older messages...") : tr("Load older messages")} disabled={olderBusy} onPress={() => { void older(); }} />}
    {messages.map(message => <Card key={message.messageId} tone={message.senderId===uid?'mint':'surface'} style={{alignSelf:message.senderId===uid?'flex-end':'flex-start',maxWidth:'92%',borderBottomRightRadius:message.senderId===uid?6:24,borderBottomLeftRadius:message.senderId===uid?24:6}}>
      <Copy variant="caption" tone="muted">{message.senderId === uid ? tr("You") : message.senderId === room.doctorId ? tr("Doctor") : tr("Patient")} · {new Date(message.createdAt).toLocaleString(localeTag())}</Copy>
      {message.type==='attachment'&&message.attachment?<><Copy>{message.attachment.contentType==='application/pdf'?tr("PDF document"):tr("Image document")}</Copy><Copy numberOfLines={3}>{message.attachment.filename}</Copy><Copy tone="muted">{Math.ceil(message.attachment.sizeBytes/1024)} {tr("KiB · Shared")}</Copy><Action secondary title={tr("View private document")} onPress={()=>setAttachment(message.attachment!)}/></>:<Copy selectable>{message.text}</Copy>}
    </Card>)}
    {!readOnly && <>
    {!room.canSend && <Copy>{tr("This consultation is not available for new messages.")}</Copy>}
    <Field label={tr("Message")} multiline placeholder={tr("Type a message...")} maxLength={4000} value={text} editable={!sending && !sendError && room.canSend} onChangeText={setText} />
    {sendError?<Notice message={systemMessage(notice)}/>:notice&&<Copy accessibilityLiveRegion="polite">{systemMessage(notice)}</Copy>}
    {!sendError&&notice&&readingError&&<Copy tone="muted">{tr('Your message is saved. Message history could not be synchronized.')}</Copy>}
    <Action title={sending ? tr("Sending...") : sendError ? tr("Retry same message") : tr("Send message")} disabled={sending || (!sendError && (!text.trim() || !room.canSend))} onPress={() => { void send(); }} />
    {sendError && <Copy>{tr("The pending text stays unchanged for safe retries. Leaving discards its retry key; check history before composing it again.")}</Copy>}
    <ConsultationAttachmentComposer room={room} uid={uid}/>
    </>}
    {attachment&&<ConsultationAttachmentViewer room={room} uid={uid} attachment={attachment} onClose={()=>setAttachment(null)}/>}
  </Card>;
}
