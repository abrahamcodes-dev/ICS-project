import React from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../hooks/useAuth';
import PrescriptionWorkspace,{PrescriptionRecord} from '../shared/PrescriptionWorkspace';
import {Screen,Copy} from '../../ui/design';
export default function IssuePrescriptionScreen({route}:{route?:{params?:{appointmentId:string}}}){
 const identity=useAuth(),focused=useIsFocused(),id=route?.params?.appointmentId;
 if(!focused)return null;
 if(!id)return <PrescriptionWorkspace/>;
 if(identity.status!=='ready'||!identity.firebaseUid||identity.user?.role!=='doctor'||identity.user.status!=='active'||identity.user.verificationStatus!=='approved'||!/^[a-f0-9]{64}$/.test(id))return <Screen><Copy>An active approved doctor and valid consultation are required.</Copy></Screen>;
 return <Screen variant="dashboard"><PrescriptionRecord key={identity.firebaseUid+':'+id} uid={identity.firebaseUid} cid={id} doctor/></Screen>;
}
