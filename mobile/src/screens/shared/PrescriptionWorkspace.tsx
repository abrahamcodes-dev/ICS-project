import {systemMessage} from '../../i18n/translate';
import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React, { useEffect, useRef, useState } from 'react';
import {View} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { onIdentityRefresh } from '../../services/authService';
import { readAppointmentPage, type AppointmentCursor, type AppointmentRow } from '../../services/appointmentReads';
import { createPrescriptionSession, validateMedication, type PrescriptionMedication, type Prescription } from '../../services/prescriptionService';
import { Action, Card, Copy, Field, Loading, Notice, Status, Screen } from '../../ui/design';

export default function PrescriptionWorkspace() {
  useLocale();
  const identity = useAuth(), focused = useIsFocused();
  if (!focused) return null;
  const role = identity.user?.role;
  if (identity.status !== 'ready' || identity.user?.status !== 'active' || !identity.firebaseUid || (role !== 'doctor' && role !== 'patient'))
    return <Screen><Copy>{tr("An active patient or doctor account is required.")}</Copy></Screen>;
  return <PrescriptionAppointments key={`${identity.firebaseUid}:${role}`} uid={identity.firebaseUid} role={role} />;
}
function PrescriptionAppointments({ uid, role }: { uid: string; role: 'patient' | 'doctor' }) {
  useLocale();
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
  if (blocked) return <Screen><Copy>{tr("Session changed. Reopen prescriptions.")}</Copy></Screen>;
  return <Screen variant="dashboard"><Copy title>{tr("Digital prescriptions")}</Copy>
    <Copy>{tr("Select a completed appointment. Issuance requires an existing consultation and a backend-recorded completed outcome; elapsed time alone is not completion.")}</Copy>
    {selected ? <><Action secondary title={tr("Back to appointments")} onPress={() => setSelected(null)} />
      <PrescriptionRecord key={selected} uid={uid} cid={selected} doctor={role === 'doctor'} /></> : <>
      <Action title={tr("Refresh appointments")} disabled={loading} onPress={() => { void load(false); }} />
      {loading && <Loading />}<Notice message={error ? tr("Unable to load appointments. Refresh to retry.") : null} />
      {!loading && !rows.some(r => r.status === 'completed') && <Copy>{tr("No completed appointments in the loaded pages.")}</Copy>}
      {rows.filter(r => r.status === 'completed').map(r => <Card key={r.appointmentId}><Copy>{new Date(r.startAt).toLocaleString(localeTag())}</Copy>
        <Action title={tr("View consultation prescription")} onPress={() => setSelected(r.appointmentId)} /></Card>)}
      {cursor && <Action title={tr("Load more appointments")} disabled={loading} onPress={() => { void load(true); }} />}
    </>}
  </Screen>;
}
const empty = (): PrescriptionMedication => ({ name: '', dosage: '', frequency: '', duration: '', instructions: '' });
export function PrescriptionRecord({ uid, cid, doctor }: { uid: string; cid: string; doctor: boolean }) {
  useLocale();
  const [record, setRecord] = useState<Prescription | null>(null), [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [meds, setMeds] = useState<PrescriptionMedication[]>([]), [confirm, setConfirm] = useState(false);
  const [uncertain, setUncertain] = useState(false), [sending, setSending] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<ReturnType<typeof createPrescriptionSession> | null>(null), alive = useRef(true), busy = useRef(false);
  async function read() {
    setLoading(true); setError(null);
    try { const p = await session.current!.get(); if (alive.current) { setRecord(p); setLoaded(true); } }
    catch { if (alive.current) setError(tr("Unable to retrieve this prescription. Check your connection and consultation access.")); }
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
    catch { if (alive.current) setError(tr("Issuance not confirmed. Retry unchanged, or retrieve the record. Existing records cannot be overwritten.")); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  }
  if (blocked) return <Copy>{tr("Session changed. Reopen prescriptions.")}</Copy>;
  const Container=doctor?View:Card;
  return <Container style={{gap:16}}>{!doctor&&<Copy variant="heading">{tr("Consultation prescription")}</Copy>}
    {loading && <Loading />}<Notice message={error} />
    {(error||uncertain||record)&&<Action secondary title={tr("Retrieve prescription")} disabled={loading || sending} onPress={() => { void read(); }} />}
    {record ? <><Status label={tr("Issued prescription")} tone="success"/><Copy tone="muted">{tr("Issued")}{new Date(record.issuedAt).toLocaleString(localeTag())}</Copy><Copy>{tr("Issuing doctor account:")}{' '}{record.doctorId}</Copy>
      {record.medications.map((m, i) => <Card key={i} tone="mint"><Copy variant="heading" selectable>{m.name}</Copy>{Object.entries(m).filter(([key])=>key!=='name').map(([key, value]) => <React.Fragment key={key}><Copy variant="label">{systemMessage(key.charAt(0).toUpperCase()+key.slice(1))}</Copy><Copy selectable>{value}</Copy></React.Fragment>)}</Card>)}
      <Copy>{tr("Immutable issued record. Corrections and amendments are not supported in this checkpoint.")}</Copy></> : loaded && !loading && <>
      {!doctor&&<Copy>{tr("No prescription has been issued for this consultation.")}</Copy>}
      {doctor && <><Copy variant="heading">{tr("Medication")}</Copy><Action secondary title={tr("+ Add medication")} disabled={meds.length >= 10 || confirm || uncertain} onPress={() => setMeds(old => [...old, empty()])} />{meds.map((m, i) => <Card key={i} style={{padding:14,gap:12}}><Copy variant="label">{tr("Medication")}{i + 1}</Copy>
        {(['name', 'dosage', 'frequency', 'duration', 'instructions'] as const).map(key => <Field key={key}
          label={tr("Medication {0} {1}", {"0": i + 1, "1": localeTag()==='sw-KE'?systemMessage(key.charAt(0).toUpperCase()+key.slice(1)):key})} value={m[key]} maxLength={key === 'instructions' ? 1000 : 200}
          multiline={key === 'instructions'} style={key === 'instructions'?{minHeight:96}:undefined} helperText={key === 'instructions'?tr("Required medication-specific instructions; use a single paragraph."):undefined} editable={!confirm && !uncertain && !sending} onChangeText={value => setMeds(old => old.map((item, n) => n === i ? { ...item, [key]: value } : item))} />)}
        {<Action secondary title={tr("Remove medication {0}", {"0": i + 1})} disabled={confirm || uncertain} onPress={() => setMeds(old => old.filter((_, n) => n !== i))} />}
      </Card>)}
      <Field label={tr("Additional instructions")} value="" editable={false} multiline style={{minHeight:104}} placeholder={tr("E.g. dosage, frequency, duration, special notes...")} helperText={tr("General instructions are not supported yet. Enter instructions separately for each medication.")}/>
      <Copy variant="label">{tr("Attach document (optional)")}</Copy><Action secondary title={tr("Upload file")} disabled onPress={()=>{}}/><Copy variant="caption" tone="muted">{tr("Prescription attachments are not supported.")}</Copy>
      {!confirm ? <Action title={tr("Send prescription")} onPress={() => {
        try { if(!meds.length)throw new Error('required'); meds.forEach(validateMedication); setConfirm(true); setError(null); } catch { setError(tr("Add at least one medication and complete every required field before sending. Instructions must be a single paragraph.")); }
      }} /> : <><Copy>{tr("Confirm the medication details above. Issuance creates one permanent record for this consultation.")}</Copy>
        <Action title={sending ? tr("Submitting...") : uncertain ? tr("Retry unchanged prescription") : tr("Confirm issuance")} disabled={sending} onPress={() => { void issue(); }} />
        {!uncertain && <Action secondary title={tr("Edit before issuing")} onPress={() => setConfirm(false)} />}
      </>}
      {uncertain && <Copy>{tr("Keep this screen open for safe retries. Leaving loses the retry key; retrieve the existing record before trying again.")}</Copy>}
      </>}
    </>}
  </Container>;
}
