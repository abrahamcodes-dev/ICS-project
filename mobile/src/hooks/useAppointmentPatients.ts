import {useEffect,useState} from 'react';
import {createAvatarSession} from '../services/avatarService';
import type {AppointmentRow} from '../services/appointmentReads';
import type {AppointmentPatientDisplay} from '@shared/types/schedulingReads';

/** Memory-only display data, scoped to the signed-in doctor and visible appointments. */
export function useAppointmentPatients(uid:string, rows:AppointmentRow[]) {
 const signature=JSON.stringify(rows.map(a=>[a.appointmentId,a.patientId]).sort());
 const [state,setState]=useState<{owner:string;signature:string;patients:Record<string,AppointmentPatientDisplay>}>({owner:uid,signature,patients:{}});
 useEffect(()=>{
  let active=true;
  setState({owner:uid,signature,patients:{}});
  const session=createAvatarSession(uid,()=>{active=false;setState({owner:uid,signature,patients:{}});});
  const groups=new Map<string,string[]>();
  for(const [appointmentId,patientId] of JSON.parse(signature) as string[][])groups.set(patientId,[...(groups.get(patientId)??[]),appointmentId]);
  // Sequential bounded reads avoid flooding Functions when many appointments are visible.
  void (async()=>{for(const ids of groups.values()){
   if(!active)break;
   try {const display=await session.readAppointmentPatient(ids[0]);if(active)setState(previous=>({...previous,patients:{...previous.patients,...Object.fromEntries(ids.map(id=>[id,{...display,appointmentId:id}]))}}));}
   catch {/* The appointment remains usable with a neutral name/avatar fallback. */}
  }})();
  return()=>{active=false;session.dispose();};
 },[uid,signature]);
 return state.owner===uid&&state.signature===signature?state.patients:{};
}
