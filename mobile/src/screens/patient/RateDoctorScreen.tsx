import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PatientStackParams } from '../../navigation/types';
import { useAuth } from '../../hooks/useAuth';
import { Screen, Copy } from '../../ui/design';
import { PatientRating } from '../shared/RatingPanels';
export default function RateDoctorScreen({ route }: NativeStackScreenProps<PatientStackParams, 'RateDoctor'>) {
  const identity = useAuth(), focused = useIsFocused();
  if (!focused) return null;
  const cid = route.params?.consultationId;
  if (identity.status !== 'ready' || identity.user?.role !== 'patient' || identity.user.status !== 'active'
    || !identity.firebaseUid || !cid || !/^[a-f0-9]{64}$/.test(cid)) return <Screen><Copy>Open a completed appointment from your account.</Copy></Screen>;
  return <Screen><PatientRating key={`${identity.firebaseUid}:${cid}`} uid={identity.firebaseUid} cid={cid}/></Screen>;
}
