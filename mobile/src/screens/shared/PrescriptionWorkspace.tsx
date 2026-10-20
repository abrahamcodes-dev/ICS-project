import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { onIdentityRefresh } from '../../services/authService';
import { readAppointmentPage, type AppointmentCursor, type AppointmentRow } from '../../services/appointmentReads';
import { createPrescriptionSession, validateMedication, type PrescriptionMedication, type Prescription } from '../../services/prescriptionService';
import { Action, Card, Copy, Field, Loading, Notice, Screen } from '../../ui/design';

export default function PrescriptionWorkspace() {
  const identity = useAuth(), focused = useIsFocused();
  if (!focused) return null;
  const role = identity.user?.role;
  if (identity.status !== 'ready' || identity.user?.status !== 'active' || !identity.firebaseUid || (role !== 'doctor' && role !== 'patient'))
    return <Screen><Copy>An active patient or doctor account is required.</Copy></Screen>;
  return <PrescriptionAppointments key={`${identity.firebaseUid}:${role}`} uid={identity.firebaseUid} role={role} />;
}
function PrescriptionAppointments({ uid, role }: { uid: string; role: 'patient' | 'doctor' }) {
  const [rows, setRows] = useState<AppointmentRow[]>([]), [cursor, setCursor] = useState<AppointmentCursor | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const alive = useRef(true), busy = useRef(false);
  async function load(more: boolean) {
    if (!alive.current || busy.current) return;
    busy.current = true; setLoading(true); setError(false);
    try {
      const page = await readAppointmentPage(uid, role, 'history', 0, more ? cursor ?? undefined : undefined);
      if (alive.current) { setRows(old => [...new Map([...(more ? old : []), ...page.rows].map(r => [r.appointmentId, r])).values()]); setCursor(page.cursor); }
    } catch { if (alive.current) setError(true); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void load(false);
    const stop = onIdentityRefresh(() => { alive.current = false; setRows([]); setSelected(null); setBlocked(true); });
    return () => { alive.current = false; stop(); };
  }, [uid, role]);
  if (blocked) return <Screen><Copy>Session changed. Reopen prescriptions.</Copy></Screen>;
  return <Screen><Copy title>Digital prescriptions</Copy>
    <Copy>Select a completed appointment. Issuance requires an existing consultation and a backend-recorded completed outcome; elapsed time alone is not completion.</Copy>
    {selected ? <><Action secondary title="Back to appointments" onPress={() => setSelected(null)} />
      <PrescriptionRecord key={selected} uid={uid} cid={selected} doctor={role === 'doctor'} /></> : <>
      <Action title="Refresh appointments" disabled={loading} onPress={() => { void load(false); }} />
      {loading && <Loading />}<Notice message={error ? 'Unable to load appointments. Refresh to retry.' : null} />
      {!loading && !rows.some(r => r.status === 'completed') && <Copy>No completed appointments in the loaded pages.</Copy>}
      {rows.filter(r => r.status === 'completed').map(r => <Card key={r.appointmentId}><Copy>{new Date(r.startAt).toLocaleString()}</Copy>
        <Action title="View consultation prescription" onPress={() => setSelected(r.appointmentId)} /></Card>)}
      {cursor && <Action title="Load more appointments" disabled={loading} onPress={() => { void load(true); }} />}
    </>}
  </Screen>;
}
const empty = (): PrescriptionMedication => ({ name: '', dosage: '', frequency: '', duration: '', instructions: '' });
export function PrescriptionRecord({ uid, cid, doctor }: { uid: string; cid: string; doctor: boolean }) {
  const [record, setRecord] = useState<Prescription | null>(null), [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [meds, setMeds] = useState<PrescriptionMedication[]>([empty()]), [confirm, setConfirm] = useState(false);
  const [uncertain, setUncertain] = useState(false), [sending, setSending] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<ReturnType<typeof createPrescriptionSession> | null>(null), alive = useRef(true), busy = useRef(false);
  async function read() {
    setLoading(true); setError(null);
    try { const p = await session.current!.get(); if (alive.current) { setRecord(p); setLoaded(true); } }
    catch { if (alive.current) setError('Unable to retrieve this prescription. Check your connection and consultation access.'); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; const current = createPrescriptionSession(uid, cid); session.current = current; void read();
    const stop = onIdentityRefresh(() => { alive.current = false; current.dispose(); setRecord(null); setMeds([empty()]); setBlocked(true); });
    return () => { alive.current = false; current.dispose(); stop(); };
  }, [uid, cid]);
  async function issue() {
    if (!alive.current || busy.current || !confirm || !doctor) return;
    busy.current = true; setSending(true); setError(null); setUncertain(true);
    try { const p = await session.current!.issue(meds); if (alive.current) { setRecord(p); setMeds([empty()]); setConfirm(false); } }
    catch { if (alive.current) setError('Issuance not confirmed. Retry unchanged, or retrieve the record. Existing records cannot be overwritten.'); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  }
  if (blocked) return <Copy>Session changed. Reopen prescriptions.</Copy>;
  return <Card><Copy title>Consultation prescription</Copy>
    {loading && <Loading />}<Notice message={error} />
    <Action title="Retrieve prescription" disabled={loading || sending} onPress={() => { void read(); }} />
    {record ? <><Copy>Issued {new Date(record.issuedAt).toLocaleString()}</Copy><Copy>Issuing doctor account: {record.doctorId}</Copy>
      {record.medications.map((m, i) => <Card key={i}>{Object.entries(m).map(([key, value]) => <Copy key={key} selectable>{key}: {value}</Copy>)}</Card>)}
      <Copy>Immutable issued record. Corrections and amendments are not supported in this checkpoint.</Copy></> : loaded && !loading && <>
      <Copy>No prescription has been issued for this consultation.</Copy>
      {doctor && <>{meds.map((m, i) => <Card key={i}><Copy>Medication {i + 1}</Copy>
        {(['name', 'dosage', 'frequency', 'duration', 'instructions'] as const).map(key => <Field key={key}
          label={`Medication ${i + 1} ${key}`} value={m[key]} maxLength={key === 'instructions' ? 1000 : 200}
          editable={!confirm && !uncertain && !sending} onChangeText={value => setMeds(old => old.map((item, n) => n === i ? { ...item, [key]: value } : item))} />)}
        {meds.length > 1 && <Action title={`Remove medication ${i + 1}`} disabled={confirm || uncertain} onPress={() => setMeds(old => old.filter((_, n) => n !== i))} />}
      </Card>)}
      <Action title="Add medication" disabled={meds.length >= 10 || confirm || uncertain} onPress={() => setMeds(old => [...old, empty()])} />
      {!confirm ? <Action title="Review prescription" onPress={() => {
        try { meds.forEach(validateMedication); setConfirm(true); setError(null); } catch { setError('Complete all medication fields before review.'); }
      }} /> : <><Copy>Confirm the medication details above. Issuance creates one permanent record for this consultation.</Copy>
        <Action title={sending ? 'Submitting...' : uncertain ? 'Retry unchanged prescription' : 'Confirm issuance'} disabled={sending} onPress={() => { void issue(); }} />
        {!uncertain && <Action secondary title="Edit before issuing" onPress={() => setConfirm(false)} />}
      </>}
      {uncertain && <Copy>Keep this screen open for safe retries. Leaving loses the retry key; retrieve the existing record before trying again.</Copy>}
      </>}
    </>}
  </Card>;
}
