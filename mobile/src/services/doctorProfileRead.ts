import {doc,getDoc} from 'firebase/firestore';
import {auth,db} from './firebaseConfig';
import type {DoctorDraftInput} from '@shared/types/profiles';
export async function readOwnDoctorProfile(uid:string):Promise<DoctorDraftInput|null>{
 if(auth.currentUser?.uid!==uid)throw new Error('Current account required');
 const snapshot=await getDoc(doc(db,'doctorProfiles',uid));
 if(auth.currentUser?.uid!==uid)throw new Error('Account changed');
 if(!snapshot.exists())return null;
 const data=snapshot.data();
 if(data.uid!==uid||data.schemaVersion!==1)throw new Error('Invalid profile');
 const result:DoctorDraftInput={};
 for(const key of ['professionalName','specialty','phoneNumber','registrationNumber','issuingAuthority'] as const){
  if(data[key]!==undefined){if(typeof data[key]!=='string')throw new Error('Invalid profile');result[key]=data[key];}
 }
 return result;
}
