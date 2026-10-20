import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PatientStackParams } from '../../navigation/types';
import { useAuth } from '../../hooks/useAuth';
import { useSchedulingSession } from '../../hooks/useSchedulingSession';
import { getPatientDoctor, type PublicDoctor } from '../../services/patientDoctors';
import { localDate, schedulingError } from '../../services/schedulingService';
import type { AvailableAppointmentTime } from '@shared/types/scheduling';
import { Screen, Copy, Action, Card, Field, Loading, Notice } from '../../ui/design';
import SchedulingAppointments from '../shared/SchedulingAppointments';
import {PatientMenu} from './PatientMenu';

export function PatientAppointments({ navigation }: NativeStackScreenProps<PatientStackParams, 'Appointments'>) {
  const { firebaseUid } = useAuth(), focused = useIsFocused();
  const [mode, setMode] = useState<'upcoming' | 'history'>('upcoming'), [boundary] = useState(() => Date.now() - 45 * 60000);
  return <Screen><Copy title>Your appointments</Copy><Copy>Times use your device time zone. History includes all statuses; elapsed appointments are not automatically completed.</Copy>
    <Action title="Upcoming and active" secondary={mode !== 'upcoming'} onPress={() => setMode('upcoming')}/>
    <Action title="Appointment history" secondary={mode !== 'history'} onPress={() => setMode('history')}/>
    {firebaseUid && focused && <SchedulingAppointments key={`${firebaseUid}:${mode}`} uid={firebaseUid} role="patient" mode={mode} boundary={boundary} open={appointmentId => navigation.navigate('Consultation', { appointmentId })} rate={consultationId => navigation.navigate('RateDoctor', { consultationId })}/>}
    <PatientMenu navigation={navigation}/></Screen>;
}
export function DoctorsScreen(props: NativeStackScreenProps<PatientStackParams, 'Doctors'>) {
  const { firebaseUid } = useAuth(), focused = useIsFocused();
  return firebaseUid && focused ? <DoctorDirectory key={firebaseUid} uid={firebaseUid} {...props}/> : <Screen><Loading/></Screen>;
}
function DoctorDirectory({ uid, navigation }: NativeStackScreenProps<PatientStackParams, 'Doctors'> & { uid: string }) {
  const session = useSchedulingSession(uid), generation = useRef(0), busy = useRef(false);
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]), [cursor, setCursor] = useState<string | null>(null), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  async function load(more: boolean, token = generation.current) {
    if (!session || busy.current) return; busy.current = true; setLoading(true); setError(null);
    try {
      const page = await session.listDoctors(more ? cursor ?? undefined : undefined); if (token !== generation.current) return;
      setDoctors(previous => [...new Map([...(more ? previous : []), ...page.items].map(d => [d.uid, d])).values()]); setCursor(page.nextCursor);
    } catch (e) { if (token === generation.current) setError(schedulingError(e)); }
    finally { if (token === generation.current) { busy.current = false; setLoading(false); } }
  }
  useEffect(() => { const token = ++generation.current; busy.current = false; setDoctors([]); setCursor(null); void load(false, token); return () => { ++generation.current; }; }, [session, retry]);
  const matches = doctors.filter(d => `${d.professionalName} ${d.specialty}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <Screen><Copy title>Find a doctor</Copy><Copy>Approved doctors. Search filters only the results loaded so far.</Copy>
    <Field label="Search loaded names or specialties" value={search} onChangeText={setSearch}/>
    <Action secondary title="Refresh doctors" disabled={loading} onPress={() => setRetry(v => v + 1)}/>
    {loading && <Loading label="Loading doctors..."/>}<Notice message={error}/>
    {!loading && !error && !matches.length && <Card><Copy>No matching doctors in the loaded results.</Copy></Card>}
    {matches.map(d => <Card key={d.uid}><Copy title>{d.professionalName}</Copy><Copy>{d.specialty}</Copy><Copy>Verified public profile</Copy><Action title="View doctor" onPress={() => navigation.navigate('DoctorProfile', { doctorId: d.uid })}/></Card>)}
    {cursor && <Action title="Load more doctors" disabled={loading} onPress={() => void load(true)}/>}
    <PatientMenu navigation={navigation}/></Screen>;
}
export function DoctorProfileScreen(props: NativeStackScreenProps<PatientStackParams, 'DoctorProfile'>) {
  const { firebaseUid } = useAuth(), focused = useIsFocused();
  return firebaseUid && focused ? <DoctorTimes key={`${firebaseUid}:${props.route.params.doctorId}`} uid={firebaseUid} {...props}/> : <Screen><Loading/></Screen>;
}
function DoctorTimes({ uid, route, navigation }: NativeStackScreenProps<PatientStackParams, 'DoctorProfile'> & { uid: string }) {
  const session = useSchedulingSession(uid), [day, setDay] = useState(() => localDate());
  const [doctor, setDoctor] = useState<PublicDoctor | null>(null), [times, setTimes] = useState<AvailableAppointmentTime[]>([]);
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setTimes([]); setDoctor(null); setError(null); setLoading(true); if (!session) return;
    void getPatientDoctor(route.params.doctorId).then(async d => { const slots = await session.times(d.uid, day); if (active) { setDoctor(d); setTimes(slots); } })
      .catch(e => { if (active) setError(schedulingError(e)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, [route.params.doctorId, day, session, retry]);
  return <Screen><Copy title>Doctor profile</Copy><Field label="Local appointment date (YYYY-MM-DD)" value={day} onChangeText={setDay} maxLength={10}/>
    <Copy>Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Select a date within the next 90 days.</Copy>
    {loading && <Loading/>}<Notice message={error}/><Action secondary title="Refresh available times" disabled={loading} onPress={() => setRetry(v => v + 1)}/>
    {doctor && <Card><Copy title>{doctor.professionalName}</Copy><Copy>{doctor.specialty}</Copy><Copy>Private credential documents are not shared with patients.</Copy></Card>}
    {!loading && !error && <Card><Copy title>Available times</Copy><Copy>30-minute appointments; minimum five-minute lead. Availability is rechecked on confirmation.</Copy>
      {times.length ? times.map(t => <Action key={t.startAt} title={`Select ${new Date(t.startAt).toLocaleTimeString()}`} onPress={() => navigation.navigate('BookAppointment', { doctorId: route.params.doctorId, startAt: t.startAt })}/>) : <Copy>No available times on this local date.</Copy>}</Card>}
    <PatientMenu navigation={navigation}/></Screen>;
}
