// Operator-only local simulation; this file is never exported as a Cloud Function.
const project=process.env.GCLOUD_PROJECT;
if(process.env.CHECKPOINT16_SIMULATION!==project||!['demo-calladoc','demo-calladoc-payments-tests'].includes(project))throw Error('Explicit demo-only operator opt-in required.');
process.env.FUNCTIONS_EMULATOR='true';
require('../lib/payments/policy').requireSimulationEnvironment();
const [id,outcome,eventId]=process.argv.slice(2);
const due=id==='--due'&&process.argv.length===3;
if(!due&&(!/^[a-f0-9]{64}$/.test(id||'')||!outcome||!eventId||process.argv.length!==5))throw Error('Usage: simulatePayment.cjs --due OR <payment-id> <outcome|reconcile> <stable-event-id>');
require('firebase-admin/app').initializeApp({projectId:project});
const {db}=require('../lib/shared/firestoreRefs'),{SimulatedMpesaProvider}=require('../lib/payments/provider'),{reconcilePayment,reconcileDuePayments}=require('../lib/payments/engine');
(async()=>{
 if(due){const result=await reconcileDuePayments(db);console.log(JSON.stringify({demo:true,...result}));if(result.failed)process.exitCode=1;}
 else{if(outcome!=='reconcile')await new SimulatedMpesaProvider(db).deliver(id,outcome,eventId);await reconcilePayment(db,id);const p=(await db.doc('consultationPayments/'+id).get()).data();console.log(JSON.stringify({demo:true,status:p.status,reasonCode:p.reasonCode}));}
 await db.terminate();
})().catch(async()=>{console.error('Demo outcome could not be confirmed. Inspect the private payment and retry the same event ID.');await db.terminate();process.exitCode=1;});
