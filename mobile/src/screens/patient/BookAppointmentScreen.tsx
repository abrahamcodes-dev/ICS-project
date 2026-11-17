import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React, { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PatientStackParams } from '../../navigation/types';
import { useAuth } from '../../hooks/useAuth';
import {PatientCheckout} from '../../components/Payments';
import { getPatientDoctor, type PublicDoctor } from '../../services/patientDoctors';
import {PatientAvatar} from './PatientMenu';


import { Screen, Card, Copy, Action, Notice, Loading, Status } from '../../ui/design';

export default function BookAppointmentScreen(props: NativeStackScreenProps<PatientStackParams, 'BookAppointment'>) {
  useLocale();
  const { firebaseUid, user, status } = useAuth();
  if (!firebaseUid || status !== 'ready' || user?.role !== 'patient' || user.status !== 'active') return <Screen><Copy>{tr("Active patient account required.")}</Copy></Screen>;
  return <Booking key={`${firebaseUid}:${props.route.params.doctorId}:${props.route.params.startAt}:${props.route.params.durationMinutes??30}`} uid={firebaseUid} {...props}/>;
}
function Booking({ uid, route, navigation }: NativeStackScreenProps<PatientStackParams, 'BookAppointment'> & { uid: string }) {
  useLocale();
 const [doctor,setDoctor]=useState<PublicDoctor|null>(null),[error,setError]=useState<string|null>(null);
 const {doctorId,startAt,durationMinutes=30}=route.params;
 useEffect(()=>{let active=true;void getPatientDoctor(doctorId).then(d=>{if(active)setDoctor(d);}).catch(()=>{if(active)setError(tr("Doctor unavailable. Return to the directory and refresh."));});return()=>{active=false;};},[doctorId]);
 return <Screen variant="form"><Copy title>{tr("Book appointment")}</Copy><Notice message={error}/>{!doctor&&!error&&<Loading/>}{doctor&&<Card><PatientAvatar uid={doctor.uid} name={doctor.professionalName}/><Copy variant="heading">{doctor.professionalName}</Copy><Copy tone="muted">{doctor.specialty}</Copy><Copy>{new Date(startAt).toLocaleString(localeTag())}</Copy><Copy>{tr("Time zone:")}{' '}{Intl.DateTimeFormat().resolvedOptions().timeZone}</Copy><PatientCheckout uid={uid} doctorId={doctorId} startAt={startAt} durationMinutes={durationMinutes} confirmed={()=>navigation.navigate('Appointments')}/><Action secondary title={tr("View appointments")} onPress={()=>navigation.navigate('Appointments')}/><Action secondary title={tr("Return to available times")} onPress={()=>navigation.navigate('DoctorProfile',{doctorId})}/></Card>}</Screen>;
}
