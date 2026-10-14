import {doc,getDoc} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {app,db} from './firebaseConfig';
import type {AvailabilityDiscoveryInput,AvailabilityDiscoveryResult} from '@shared/types/scheduling';
export interface PublicDoctor {uid:string;professionalName:string;specialty:string}
export async function getPatientDoctor(uid:string):Promise<PublicDoctor>{
 const snapshot=await getDoc(doc(db,'doctorPublicProfiles',uid)),d=snapshot.data();
 if(!snapshot.exists()||d?.uid!==uid||d.schemaVersion!==1||typeof d.professionalName!=='string'||typeof d.specialty!=='string')throw new Error('Doctor unavailable');
 return {uid,professionalName:d.professionalName,specialty:d.specialty};
}
export async function getDoctorTimes(doctorId:string){
 const read=httpsCallable<AvailabilityDiscoveryInput,AvailabilityDiscoveryResult>(getFunctions(app),'getAvailableAppointmentTimes');
 const {data}=await read({doctorId,fromDate:new Date().toISOString().slice(0,10),days:7});
 if(!Array.isArray(data.times)||data.times.some(t=>t.doctorId!==doctorId||!Number.isSafeInteger(t.startAt)||!Number.isSafeInteger(t.endAt)||t.endAt<=t.startAt))throw new Error('Invalid availability');
 return data.times;
}
