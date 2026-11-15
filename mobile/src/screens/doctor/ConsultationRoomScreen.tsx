import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {DoctorStackParams} from '../../navigation/types';
import ConsultationCallScreen from '../shared/ConsultationCallScreen';
import ConsultationOptions from './ConsultationOptions';
export default function ConsultationRoomScreen({route,navigation}:NativeStackScreenProps<DoctorStackParams,'ConsultationRoom'>){
 return <ConsultationCallScreen route={route} renderOptions={room=><ConsultationOptions room={room} prescribe={()=>navigation.navigate('IssuePrescription',{appointmentId:room.appointmentId})} ended={()=>navigation.goBack()}/>}/>;
}
