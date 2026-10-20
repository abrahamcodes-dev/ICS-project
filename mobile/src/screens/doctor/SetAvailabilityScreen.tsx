import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useSchedulingSession } from '../../hooks/useSchedulingSession';
import { DAY_MS, schedulingError, utcDayStart, windowInputs } from '../../services/schedulingService';
import type { OwnAvailabilityResult } from '@shared/types/schedulingReads';
import { Screen, Card, Copy, Field, Action, Notice, Loading } from '../../ui/design';
import SchedulingAppointments from '../shared/SchedulingAppointments';

export default function SetAvailabilityScreen({ navigation }: { navigation: { navigate(name: 'ConsultationRoom', params: { appointmentId: string }): void } }) {
  const { firebaseUid, user, status } = useAuth(), focused = useIsFocused();
  if (!focused) return null;
  if (!firebaseUid || status !== 'ready' || user?.role !== 'doctor' || user.status !== 'active' || user.verificationStatus !== 'approved')
    return <Screen><Copy>An active, approved doctor account is required.</Copy></Screen>;
  return <AvailabilityEditor key={firebaseUid} uid={firebaseUid} open={appointmentId => navigation.navigate('ConsultationRoom', { appointmentId })}/>;
}
export function AvailabilityEditor({ uid, open }: { uid: string; open(id: string): void }) {
  const session = useSchedulingSession(uid), generation = useRef(0), saving = useRef(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)), [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState<OwnAvailabilityResult['day']>(null), [rows, setRows] = useState<Array<{ start: string; end: string }>>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null), [reloadRequired, setReloadRequired] = useState(false);
  const [now, setNow] = useState(Date.now());
  let base: number | null = null;
  try { base = utcDayStart(date); } catch { /* Invalid editing date is shown below. */ }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const token = ++generation.current; setRows([]); setSaved(null); setConfirm(false); setLoading(true); setError(null); setReloadRequired(false);
    if (!session) return;
    void session.ownDay(date).then(({ day }) => {
      if (token !== generation.current) return;
      setSaved(day); const first = utcDayStart(date);
      const format = (time: number) => time === first + DAY_MS ? '24:00' : new Date(time).toISOString().slice(11, 16);
      setRows(day?.windows.map(w => ({ start: format(w.startAt), end: format(w.endAt) })) ?? []);
    }).catch(e => { if (token === generation.current) { setError(schedulingError(e)); setReloadRequired(true); } })
      .finally(() => { if (token === generation.current) setLoading(false); });
    return () => { ++generation.current; };
  }, [session, date, retry]);
  let windows: ReturnType<typeof windowInputs> = [], validation: string | null = null;
  try { windows = windowInputs(date, rows); } catch { validation = 'Use a valid UTC date and up to eight nonoverlapping windows, in HH:00 or HH:30 format. Only an end may be 24:00.'; }
  const today = utcDayStart(new Date(now).toISOString().slice(0, 10));
  if (base !== null && (base < today || base > today + 90 * DAY_MS)) validation = 'Availability can be edited from today through UTC day +90 only.';
  const locked = (index: number) => {
    try { return windowInputs(date, [rows[index]])[0].startAt <= now && !!saved?.windows.some(w => w.startAt === windowInputs(date, [rows[index]])[0].startAt); }
    catch { return false; }
  };
  const edit = (index: number, key: 'start' | 'end', value: string) => {
    setConfirm(false); setMessage(null); setRows(previous => previous.map((row, i) => i === index ? { ...row, [key]: value } : row));
  };
  async function save() {
    if (!session || saving.current || validation || reloadRequired || !confirm) return;
    saving.current = true; setBusy(true); setError(null); const token = generation.current;
    try {
      await session.replace({ utcDate: date, timeZone: saved?.timeZone ?? 'UTC', windows, expectedRevision: saved?.revision ?? 0 });
      if (token === generation.current) { setBusy(false); setMessage('Availability saved. Reloading the authoritative day.'); setRetry(v => v + 1); }
    } catch (e) { if (token === generation.current) { setError(schedulingError(e)); setReloadRequired(true); setConfirm(false); } }
    finally { saving.current = false; if (token === generation.current) setBusy(false); }
  }
  return <Screen><Copy title>Manage availability</Copy>
    <Field label="UTC scheduling date (YYYY-MM-DD)" value={date} editable={!busy} maxLength={10} onChangeText={value => { setDate(value); setMessage(null); }}/>
    <Copy>One UTC day per save. Windows use UTC; previews use your device time zone. Slots last 30 minutes.</Copy>
    <Action secondary title="Reload saved availability" disabled={loading || busy} onPress={() => { setMessage(null); setRetry(v => v + 1); }}/>
    {loading && <Loading label="Loading saved availability..."/>}<Notice message={error}/><Notice message={validation}/>{message && <Copy>{message}</Copy>}
    {!loading && !reloadRequired && <Card><Copy>Saved revision: {saved?.revision ?? 0}. Time-zone metadata: {saved?.timeZone ?? 'UTC'}.</Copy>
      {rows.map((row, i) => <Card key={i}><Field label={`Window ${i + 1} UTC start`} value={row.start} editable={!busy && !locked(i)} onChangeText={v => edit(i, 'start', v)} maxLength={5}/>
        <Field label={`Window ${i + 1} UTC end`} value={row.end} editable={!busy && !locked(i)} onChangeText={v => edit(i, 'end', v)} maxLength={5}/>
        {locked(i) && <Copy>This started window must remain unchanged.</Copy>}
        <Action secondary title={`Remove window ${i + 1}`} disabled={busy || locked(i)} onPress={() => { setRows(previous => previous.filter((_, index) => index !== i)); setConfirm(false); }}/></Card>)}
      <Action secondary title="Add window" disabled={busy || rows.length >= 8} onPress={() => { setRows(previous => [...previous, { start: '', end: '' }]); setConfirm(false); }}/>
      {!validation && windows.map(w => <Copy key={w.startAt}>Local preview: {new Date(w.startAt).toLocaleString()} – {new Date(w.endAt).toLocaleString()}</Copy>)}
      {!rows.length && <Copy>Saving an empty day removes future availability only when no booked coverage or started window requires it.</Copy>}
      <Action title="Review replacement" disabled={busy || !!validation} onPress={() => setConfirm(true)}/>
      {confirm && <><Copy>Replace the entire UTC day using revision {saved?.revision ?? 0}? Existing bookings must remain covered.</Copy>
        <Action title="Confirm availability replacement" disabled={busy} onPress={() => void save()}/><Action secondary title="Continue editing" disabled={busy} onPress={() => setConfirm(false)}/></>}
    </Card>}
    {base !== null && <><Copy title>Booked appointments (selected UTC day)</Copy><Copy>Confirmed records, separate from open windows.</Copy>
      <SchedulingAppointments key={`${uid}:${date}:${retry}`} uid={uid} role="doctor" mode="day" boundary={base} end={base + DAY_MS} open={open}/></>}
  </Screen>;
}
