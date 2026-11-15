// Trusted LOCAL emulator operator only. Cloud Scheduler does not tick locally.
// Never create a request or change approval/clinical records from this script.
const expected={GCLOUD_PROJECT:'demo-calladoc',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'};
for(const [key,value] of Object.entries(expected))if(process.env[key]!==value)throw Error('Explicit local demo emulator configuration required: '+key);
const uid=process.argv[2];if(!uid||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||process.argv.length!==3)throw Error('Supply exactly one synthetic account UID with an already-confirmed deletion request.');
require('firebase-admin/app').initializeApp({projectId:'demo-calladoc',storageBucket:'demo-calladoc.appspot.com'});
const {db}=require('../lib/shared/firestoreRefs');
(async()=>{
 const ref=db.doc('accountDeletionJobs/'+uid),before=await ref.get();
 if(!before.exists||before.data().uid!==uid)throw Error('No accepted deletion request for this UID.');
 await require('../lib/accounts/deletionWorker').processAccountDeletion(uid);
 const {state,phase,legalErasure}= (await ref.get()).data();console.log(JSON.stringify({state,phase,legalErasure}));await db.terminate();
})().catch(async()=>{console.error('Local cleanup could not finish. Inspect the private job and retry its recorded phase.');await db.terminate();process.exitCode=1;});
