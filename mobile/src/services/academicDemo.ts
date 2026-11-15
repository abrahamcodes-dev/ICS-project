export const hostedAcademicEnvironment=(mode:string|undefined,project:string|undefined)=>mode==='false'
  && /^[a-z][a-z0-9-]*-academic-demo$/.test(project || '') && !project?.startsWith('demo-');
export const isHostedAcademicDemo=()=>hostedAcademicEnvironment(process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS,process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
export async function academicUpload(kind:'credential'|'avatar',id:string,uri:string) {
  const BlobUtil=(require('react-native-blob-util') as typeof import('react-native-blob-util')).default;
  const base64=await BlobUtil.fs.readFile(uri.replace(/^file:\/\//,''),'base64');
  if(!base64.length||base64.length>Math.ceil((kind==='avatar'?262144:5242880)/3)*4)throw new Error('Invalid upload size.');
  const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
  const {functions}=require('./firebaseConfig') as typeof import('./firebaseConfig');
  return httpsCallable(functions,'uploadAcademicDemoObject')({kind,id,base64});
}
export async function academicCredentialBytes(credentialId:string):Promise<ArrayBuffer> {
  const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
  const {functions}=require('./firebaseConfig') as typeof import('./firebaseConfig');
  const result=await httpsCallable<{credentialId:string},{base64:string}>(functions,'readAcademicDemoCredential')({credentialId});
  if(typeof result.data.base64!=='string'||result.data.base64.length>Math.ceil(5242880/3)*4)throw new Error('Invalid evidence.');
  const decoded=atob(result.data.base64);
  return Uint8Array.from(decoded,c=>c.charCodeAt(0)).buffer;
}
