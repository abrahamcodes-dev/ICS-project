import React, { useEffect, useRef, useState } from 'react';
import { Action, Card, Copy, Field, Loading, Notice } from '../../ui/design';
import { readAppointmentPage, consultationUnavailable, type AppointmentRow, type AppointmentCursor,
  type AppointmentPageMode, type ParticipantRole } from '../../services/appointmentReads';
import { useSchedulingSession } from '../../hooks/useSchedulingSession';
import { schedulingError } from '../../services/schedulingService';

export default function SchedulingAppointments({ uid, role, open, rate, mode = 'upcoming', boundary, end }:
  { uid: string; role: ParticipantRole; open(id: string): void; rate?(id: string): void; mode?: AppointmentPageMode; boundary: number; end?: number }) {
  const session = useSchedulingSession(uid), generation = useRef(0), busy = useRef(false), deciding = useRef(false);
  const [rows, setRows] = useState<AppointmentRow[]>([]), [cursor, setCursor] = useState<AppointmentCursor | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [cancel, setCancel] = useState<AppointmentRow | null>(null), [reason, setReason] = useState(''), [pending, setPending] = useState(false);
  const [complete, setComplete] = useState<AppointmentRow | null>(null);
  const [uncertain, setUncertain] = useState(false), [message, setMessage] = useState<string | null>(null), [now, setNow] = useState(Date.now());
  async function load(more: boolean, token = generation.current) {
    if (busy.current) return; busy.current = true; setLoading(true); setError(null);
    try {
      const page = await readAppointmentPage(uid, role, mode, boundary, more ? cursor ?? undefined : undefined, end);
      if (token !== generation.current) return;
      setRows(previous => [...new Map([...(more ? previous : []), ...page.rows].map(a => [a.appointmentId, a])).values()]); setCursor(page.cursor);
    } catch { if (token === generation.current) setError('Unable to load appointments. Refresh to retry.'); }
    finally { if (token === generation.current) { busy.current = false; setLoading(false); } }
  }
  useEffect(() => {
    const token = ++generation.current; busy.current = false; setRows([]); setCursor(null); setCancel(null); setComplete(null); setReason(''); setUncertain(false); setPending(false);
    void load(false, token);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { ++generation.current; clearInterval(timer); };
  }, [uid, role, mode, boundary, end, retry]);
  async function confirmCancel() {
    if (!session || !cancel || deciding.current) return;
    deciding.current = true; setPending(true); setError(null); const token = generation.current;
    try {
      await session.cancel(cancel.appointmentId, reason);
      if (token !== generation.current) return;
      setCancel(null); setMessage('Appointment canceled.'); setRetry(v => v + 1);
    } catch (e) { if (token === generation.current) { setError(schedulingError(e)); setUncertain(true); } }
    finally { deciding.current = false; if (token === generation.current) setPending(false); }
  }
  async function confirmComplete() {
    if (!session || !complete || deciding.current || role !== 'doctor' || complete.doctorId !== uid
      || complete.status !== 'scheduled' || Date.now() < complete.endAt) return;
    deciding.current = true; setPending(true); setError(null); const token = generation.current;
    try {
      await session.complete(complete.appointmentId);
      if (token !== generation.current) return;
      setComplete(null); setMessage('Appointment completed. Open Consultation prescriptions to select the confirmed completed appointment.');
      setRetry(v => v + 1);
    } catch (e) { if (token === generation.current) { setError(schedulingError(e)); setUncertain(true); } }
    finally { deciding.current = false; if (token === generation.current) setPending(false); }
  }
  return <>
    <Action secondary title="Refresh appointments" disabled={loading || pending} onPress={() => { setMessage(null); setRetry(v => v + 1); }}/>
    {loading && <Loading label="Loading appointments..."/>}<Notice message={error}/>{message && <Copy>{message}</Copy>}
    {!loading && !error && !rows.length && <Card><Copy>No appointments in this view.</Copy></Card>}
    {rows.map(a => {
      const unavailable = consultationUnavailable(a, uid, role, now);
      return <Card key={a.appointmentId}><Copy title>{new Date(a.startAt).toLocaleString()}</Copy><Copy>{a.status.replace('_', ' ')}</Copy>
        {unavailable && <Copy>{unavailable}</Copy>}<Action title="Open consultation" disabled={!!unavailable} onPress={() => {
          if (!consultationUnavailable(a, uid, role, Date.now())) open(a.appointmentId);
        }}/>
        {role === 'patient' && a.patientId === uid && a.status === 'completed' && rate &&
          <Action title="Rate or view my rating" onPress={() => rate(a.appointmentId)}/>}
        {role === 'doctor' && a.doctorId === uid && a.status === 'scheduled' && a.endAt <= now &&
          <Action title="Record completed appointment" disabled={pending || !!complete} onPress={() => {
            if (a.endAt <= Date.now()) { setComplete(a); setUncertain(false); setMessage(null); setError(null); }
          }} />}
        {role === 'patient' && a.status === 'scheduled' && a.startAt > now && <Action secondary title="Cancel appointment" disabled={pending || !!cancel}
          onPress={() => { setCancel(a); setReason(''); setUncertain(false); setMessage(null); }}/>}</Card>;
    })}
    {cursor && <Action title="Load more appointments" disabled={loading || pending} onPress={() => void load(true)}/>}
    {complete && <Card><Copy title>Confirm appointment completion</Copy><Copy>{new Date(complete.startAt).toLocaleString()}</Copy>
      <Copy>Confirm that this appointment was completed. This is a permanent outcome, not a no-show. Backend authorization and timing checks still apply.</Copy>
      {uncertain && <Copy>Completion is unconfirmed. Retry the same outcome or refresh appointments to check.</Copy>}
      <Action title={pending ? 'Recording completion...' : uncertain ? 'Retry same completion' : 'Confirm completion'}
        disabled={pending || !session} onPress={() => { void confirmComplete(); }} />
      <Action secondary title="Close completion confirmation" disabled={pending} onPress={() => setComplete(null)} />
    </Card>}
    {cancel && <Card><Copy title>Confirm cancellation</Copy><Copy>{new Date(cancel.startAt).toLocaleString()}</Copy>
      <Field label="Cancellation reason (optional)" value={reason} editable={!pending && !uncertain} maxLength={500} onChangeText={setReason}/>
      {uncertain && <Copy>The result is uncertain. Retry the same cancellation or refresh appointments to check.</Copy>}
      <Action danger title={uncertain ? 'Retry same cancellation' : 'Confirm cancellation'} disabled={pending || !session} onPress={() => void confirmCancel()}/>
      <Action secondary title="Keep appointment / close" disabled={pending} onPress={() => setCancel(null)}/></Card>}
  </>;
}
