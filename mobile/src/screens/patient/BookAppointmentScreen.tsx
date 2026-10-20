import React, { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PatientStackParams } from '../../navigation/types';
import { useAuth } from '../../hooks/useAuth';
import { useSchedulingSession } from '../../hooks/useSchedulingSession';
import { getPatientDoctor, type PublicDoctor } from '../../services/patientDoctors';
import { schedulingError } from '../../services/schedulingService';
import type { BookingResult } from '@shared/types/scheduling';
import { Screen, Card, Copy, Action, Notice, Loading } from '../../ui/design';

export default function BookAppointmentScreen(props: NativeStackScreenProps<PatientStackParams, 'BookAppointment'>) {
  const { firebaseUid, user, status } = useAuth();
  if (!firebaseUid || status !== 'ready' || user?.role !== 'patient' || user.status !== 'active') return <Screen><Copy>Active patient account required.</Copy></Screen>;
  return <Booking key={`${firebaseUid}:${props.route.params.doctorId}:${props.route.params.startAt}`} uid={firebaseUid} {...props}/>;
}
function Booking({ uid, route, navigation }: NativeStackScreenProps<PatientStackParams, 'BookAppointment'> & { uid: string }) {
  const session = useSchedulingSession(uid), alive = useRef(true), lock = useRef(false);
  const [doctor, setDoctor] = useState<PublicDoctor | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [result, setResult] = useState<BookingResult | null>(null);
  const [conflict, setConflict] = useState(false);
  const { doctorId, startAt } = route.params;
  useEffect(() => { alive.current = true; void getPatientDoctor(doctorId).then(d => { if (alive.current) setDoctor(d); })
    .catch(() => { if (alive.current) setError('Doctor profile unavailable. Return to the directory and refresh.'); });
    return () => { alive.current = false; }; }, [doctorId]);
  useEffect(() => { if (session) { try { session.selectBooking(doctorId, startAt); } catch { setError('Invalid appointment selection.'); } } }, [session, doctorId, startAt]);
  async function confirm() {
    if (!session || !doctor || lock.current || result || conflict) return;
    lock.current = true; setBusy(true); setError(null); setAttempted(true);
    try { const response = await session.book(); if (alive.current) setResult(response); }
    catch (e) { if (alive.current) { setError(schedulingError(e)); setConflict((e as { code?: string }).code === 'functions/already-exists'); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <Screen><Copy title>Review appointment</Copy>{!doctor && !error && <Loading/>}<Notice message={error}/>
    {doctor && <Card><Copy title>{doctor.professionalName}</Copy><Copy>{doctor.specialty}</Copy>
      <Copy>{new Date(startAt).toLocaleString()}</Copy><Copy>Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Duration: 30 minutes.</Copy>
      {!result && <><Copy>Availability and account eligibility are checked again when you confirm.</Copy>
        {attempted && <Copy>If the response was lost, retry here using the same request. Leaving this screen loses that retry key; check your appointments before booking again.</Copy>}
        <Action title={attempted ? 'Retry same booking' : 'Confirm booking'} disabled={busy || !session || conflict} onPress={() => void confirm()}/></>}
      {result && <Copy>{result.status === 'scheduled' ? 'Appointment confirmed.' : `This request already belongs to a ${result.status} appointment. No new appointment was created.`}</Copy>}
      <Action secondary title="View appointments" disabled={busy} onPress={() => navigation.navigate('Appointments')}/>
      <Action secondary title="Return to available times" disabled={busy} onPress={() => navigation.navigate('DoctorProfile', { doctorId })}/>
    </Card>}</Screen>;
}
