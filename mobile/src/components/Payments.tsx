import {displayCode} from "../i18n/translate";
import {localeTag} from "../i18n/locale";
import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,View} from 'react-native';
import {uuid} from 'expo-modules-core';
import {Action,Card,Copy,Field,Loading,Notice,Screen,Status} from '../ui/design';
import {createPaymentSession,formatKsh,normalizeTestPhone,parseKsh,paymentError} from '../services/payments';
import type {ConsultationFee,PaymentView} from '@shared/types/payments';
function usePayments(uid:string){const [session]=useState(()=>createPaymentSession(uid));useEffect(()=>()=>session.dispose(),[session]);return session;}
const progress=['created','pending','review_required','refund_pending'];
export function SimulatedPaymentConfirmation({payment:p,busy,decide}:{payment:PaymentView;busy:boolean;decide(decision:'approve'|'decline'):void}){
  useLocale();
 if(!['created','pending'].includes(p.status)||p.demo!==true||p.provider!=='simulated-mpesa')return null;
 return <Card><Status label={tr("SIMULATED M-PESA")}/><Copy variant="heading">{tr("Confirm consultation payment")}</Copy>
 <Copy>{tr("Pay CallADoc")}</Copy><Copy>{tr("Description: Online consultation payment")}</Copy><Copy>{p.doctorDisplay.professionalName} · {p.doctorDisplay.specialty}</Copy>
 <Copy>{new Date(p.startAt).toLocaleString(localeTag())} · {(p.endAt-p.startAt)/60000} {tr("minutes")}</Copy><Copy variant="heading">{formatKsh(p.amountMinor)}</Copy>
 <Copy>{tr("This is a simulation. No real money will be deducted. No M-Pesa PIN is required.")}</Copy>
 <Copy>{tr("Reservation expires:")}{' '}{new Date(p.expiresAt).toLocaleTimeString(localeTag())}</Copy>
 {busy&&<Loading label={tr("Confirming authoritative payment status")}/>}
 <Action title={tr("Approve simulated payment")} disabled={busy} loading={busy} onPress={()=>decide('approve')}/>
 <Action secondary title={tr("Decline simulated payment")} disabled={busy} onPress={()=>decide('decline')}/></Card>;
}
export function DemoReceipt({payment:p}:{payment:PaymentView}){
  useLocale();
 const charged=['succeeded','refund_pending','refund_failed','refunded'].includes(p.status);
 return <Card><Status label={tr("DEMO PAYMENT — no real money")}/><Copy variant="heading">{p.status==='succeeded'?tr("Appointment confirmed"):p.status==='refunded'?tr("Demo refund completed"):tr("Demo payment status")}</Copy><Copy>{p.doctorDisplay.professionalName}</Copy><Copy>{p.doctorDisplay.specialty} {tr("· Online consultation")}</Copy><Copy>{new Date(p.startAt).toLocaleString(localeTag())} {tr("to")}{' '}{new Date(p.endAt).toLocaleTimeString(localeTag())}</Copy><Copy>{(p.endAt-p.startAt)/60000} {tr("minutes")}</Copy><Copy>{tr("Total:")}{' '}{formatKsh(p.amountMinor)}</Copy><Copy>{tr("Amount confirmed by simulator:")}{' '}{formatKsh(charged?p.amountMinor:0)}</Copy><Copy accessibilityLiveRegion="polite">{tr("Status:")}{' '}{displayCode(p.status)}</Copy>
 {p.providerReference&&<Copy selectable variant="caption">{tr("Simulated reference:")}{' '}{p.providerReference}</Copy>}{p.refundReference&&<Copy selectable variant="caption">{tr("Simulated refund:")}{' '}{p.refundReference}</Copy>}
 {p.paidAt&&<Copy variant="caption">{tr("Simulator confirmation:")}{' '}{new Date(p.paidAt).toLocaleString(localeTag())}</Copy>}
 <Copy variant="caption">{tr("Payment method: M-Pesa simulator")}</Copy><Copy variant="caption">{tr("Payment requested:")}{' '}{new Date(p.createdAt).toLocaleString(localeTag())}</Copy>
 {p.status==='review_required'&&<Copy>{tr("Confirmation is uncertain. This reservation remains protected while the simulator is reconciled. Do not start another payment.")}</Copy>}
 {p.status==='refund_pending'&&<Copy>{tr("A simulated refund has been requested. It is not completed yet.")}</Copy>}
 {p.status==='refund_failed'&&<Copy>{tr("The simulated refund failed. Retry the recorded refund; no new payment is needed.")}</Copy>}
 {p.status==='failed'&&<Copy>{tr("Simulated payment declined. No appointment was confirmed.")}</Copy>}
 {p.status==='cancelled'&&<Copy>{tr("Simulated payment cancelled. No appointment was confirmed.")}</Copy>}
 {p.status==='expired'&&<Copy>{tr("The payment reservation expired. Refresh available times before starting another checkout.")}</Copy>}
 {p.reasonCode==='late_or_unavailable_success'&&<Copy>{tr("The simulator confirmed payment after the slot became unavailable. No appointment was confirmed; the payment is being refunded.")}</Copy>}
 </Card>;
}
export function PatientCheckout({uid,doctorId,startAt,durationMinutes=30,confirmed}:{uid:string;doctorId:string;startAt:number;durationMinutes?:15|30|60;confirmed(id:string):void}){
  useLocale();
 const s=usePayments(uid),alive=useRef(true),lock=useRef(false),requestId=useRef(uuid.v4());
 const [fee,setFee]=useState<ConsultationFee|null>(null),[loaded,setLoaded]=useState(false),[phone,setPhone]=useState(''),[p,setPayment]=useState<PaymentView|null>(null),[free,setFree]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{await task();}catch(e){if(alive.current)setError(paymentError(e));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function load(){const f=await s.fee(doctorId,durationMinutes);if(alive.current){setFee(f);setLoaded(true);}}
 useEffect(()=>{void run(load);},[doctorId,durationMinutes]);
 async function refresh(){if(p){const result=await s.status(p.paymentId);if(alive.current)setPayment(result);}else await load();}
 useEffect(()=>{if(!p||!progress.includes(p.status))return;const timer=setInterval(()=>{if(AppState.currentState==='active')void run(refresh);},5000);return()=>clearInterval(timer);},[p?.paymentId,p?.status]);
 const total=fee?.totalMinor??(durationMinutes===30?fee?.amountMinor:undefined);
 async function submit(){if(!fee||total===undefined)return;let normalized:string|undefined;try{if(fee.amountMinor>0)normalized=normalizeTestPhone(phone);}catch(e){setError((e as Error).message);return;}setAttempted(true);await run(async()=>{const result=await s.checkout({doctorId,startAt,requestId:requestId.current,expectedFeeRevision:fee.revision,...(durationMinutes!==30?{durationMinutes}:{}),...(normalized?{phone:normalized}:{})});if(!alive.current)return;if(result.kind==='free')setFree(result.appointmentId);else setPayment(result.payment);});}
 return <View style={{gap:16}}><Status label={tr("DEMO PAYMENT — no real money")}/><Copy>{tr("Online consultation:")}{' '}{durationMinutes} {tr("minutes")}</Copy><Copy>{new Date(startAt).toLocaleString(localeTag())} {tr("to")}{' '}{new Date(startAt+durationMinutes*60000).toLocaleTimeString(localeTag())}</Copy><Notice message={error}/>{!loaded&&!error&&<Loading label={tr("Loading consultation fee")}/>}
 {!p&&!free&&<>{fee?<><Copy variant="heading">{tr("30-minute rate:")}{' '}{formatKsh(fee.amountMinor)}</Copy><Copy>{tr("Total payable:")}{' '}{total===undefined?tr("Refresh quote"):formatKsh(total)}</Copy>{durationMinutes===15&&<Copy>{tr("Half-rate prices round up to the next minor unit when needed.")}</Copy>}{fee.amountMinor>0?<><Copy>{tr("M-Pesa simulator only. No STK request will reach a phone. Never enter a PIN or real financial credentials.")}</Copy><Field label={tr("Kenyan test phone number")} placeholder="0700000000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!busy}/></>:<Copy>{tr("Free consultation. No M-Pesa payment or financial transaction will be created.")}</Copy>}<Action title={attempted?tr("Retry same checkout"):fee.amountMinor===0?tr("Confirm free appointment"):tr("Confirm demo payment")} disabled={busy||total===undefined} loading={busy} onPress={()=>{void submit();}}/></>:loaded&&<Copy>{tr("This doctor has not configured a consultation fee. Booking is unavailable until they do.")}</Copy>}
 <Action secondary title={tr("Refresh consultation fee")} disabled={busy} onPress={()=>{void run(load);}}/>{attempted&&<Copy>{tr("If confirmation was lost, retry this same checkout or inspect Payment history before starting another.")}</Copy>}</>}
 {free&&<><Copy accessibilityLiveRegion="polite">{tr("Free appointment confirmed. No simulated charge.")}</Copy><Action title={tr("View confirmed appointment")} onPress={()=>confirmed(free)}/></>}
 {p&&<><DemoReceipt payment={p}/><Action secondary title={tr("Refresh payment status")} disabled={busy} loading={busy} onPress={()=>{void run(refresh);}}/>
 <SimulatedPaymentConfirmation payment={p} busy={busy} decide={decision=>{void run(async()=>{const next=await s.decide(p.paymentId,decision);if(alive.current)setPayment(next);});}}/>
 {['created','pending','review_required'].includes(p.status)&&<Action secondary title={tr("Cancel pending demo payment")} disabled={busy} onPress={()=>{void run(async()=>{const next=await s.cancel(p.paymentId);if(alive.current)setPayment(next);});}}/>}
 {p.status==='refund_failed'&&<Action secondary title={tr("Retry demo refund")} disabled={busy} onPress={()=>{void run(async()=>{const next=await s.retryRefund(p.paymentId);if(alive.current)setPayment(next);});}}/>}
 {p.status==='succeeded'&&p.appointmentId&&<Action title={tr("View confirmed appointment")} onPress={()=>confirmed(p.appointmentId!)}/>}
 {['failed','cancelled','expired'].includes(p.status)&&<Action secondary title={tr("Start a new demo checkout")} disabled={busy} onPress={()=>{requestId.current=uuid.v4();setPayment(null);setAttempted(false);void run(load);}}/>}</>}
 <PaymentHistory uid={uid} confirmed={confirmed}/></View>;
}
export function FeeDisplay({uid,doctorId}:{uid:string;doctorId:string}){
  useLocale();const s=usePayments(uid),[fee,setFee]=useState<ConsultationFee|null|undefined>(undefined);useEffect(()=>{let active=true;void s.fee(doctorId).then(f=>{if(active)setFee(f);}).catch(()=>{if(active)setFee(undefined);});return()=>{active=false;};},[doctorId,s]);return <Copy tone="muted">{fee?tr("30-minute rate: {0} · Demo", {"0": formatKsh(fee.amountMinor)}):tr("Consultation fee shown at checkout when configured.")}</Copy>;}
export function PaymentHistory({uid,allowCancel=true,confirmed}:{uid:string;allowCancel?:boolean;confirmed?(id:string):void}){
  useLocale();
 const s=usePayments(uid),alive=useRef(true),lock=useRef(false),[open,setOpen]=useState(false),[rows,setRows]=useState<PaymentView[]>([]),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState<PaymentView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>()=>{alive.current=false;},[]);
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{await task();}catch(e){if(alive.current)setError(paymentError(e));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function load(more=false){const page=await s.history(more&&cursor?cursor:undefined);if(alive.current){setRows(old=>more?[...new Map([...old,...page.payments].map(p=>[p.paymentId,p])).values()]:page.payments);setCursor(page.nextCursor);}}
 return <><Action secondary title={tr("Payment history")} onPress={()=>{setOpen(true);void run(()=>load());}}/><Modal visible={open} animationType="slide" onRequestClose={()=>{setOpen(false);setSelected(null);}}><Screen variant="dashboard"><Copy title>{tr("Demo payment history")}</Copy><Copy>{tr("All amounts and receipts are simulated. No real money was collected or settled.")}</Copy><Notice message={error}/>{busy&&<Loading/>}
 {selected?<><DemoReceipt payment={selected}/>{allowCancel&&<SimulatedPaymentConfirmation payment={selected} busy={busy} decide={decision=>{void run(async()=>{const next=await s.decide(selected.paymentId,decision);if(alive.current)setSelected(next);});}}/>}{selected.status==='succeeded'&&selected.appointmentId&&confirmed&&<Action title={tr("View confirmed appointment")} onPress={()=>{setOpen(false);setSelected(null);confirmed(selected.appointmentId!);}}/>}<Action secondary title={tr("Refresh receipt")} disabled={busy} onPress={()=>{void run(async()=>{const next=await s.status(selected.paymentId);if(alive.current)setSelected(next);});}}/>{selected.status==='refund_failed'&&<Action secondary title={tr("Retry recorded refund")} disabled={busy} onPress={()=>{void run(async()=>{const next=await s.retryRefund(selected.paymentId);if(alive.current)setSelected(next);});}}/>}{allowCancel&&['created','pending','review_required'].includes(selected.status)&&<Action secondary title={tr("Cancel recorded pending payment")} disabled={busy} onPress={()=>{void run(async()=>{const next=await s.cancel(selected.paymentId);if(alive.current)setSelected(next);});}}/>}<Action secondary title={tr("Back to transactions")} onPress={()=>setSelected(null)}/></>:<>{rows.map(p=><Card key={p.paymentId}><Copy variant="label">{p.doctorDisplay.professionalName}</Copy><Copy>{new Date(p.startAt).toLocaleString(localeTag())}</Copy><Copy>{formatKsh(p.amountMinor)} · {displayCode(p.status)}</Copy><Action secondary title={tr("Open demo receipt {0}", {"0": p.paymentId.slice(-6)})} onPress={()=>{setSelected(p);void run(async()=>{const next=await s.status(p.paymentId);if(alive.current)setSelected(next);});}}/></Card>)}{!busy&&!error&&!rows.length&&<Copy>{tr("No demo payments yet. Free bookings do not create M-Pesa transactions.")}</Copy>}<Action secondary title={tr("Refresh payment history")} disabled={busy} onPress={()=>{void run(()=>load());}}/>{cursor&&<Action secondary title={tr("Load more payments")} disabled={busy} onPress={()=>{void run(()=>load(true));}}/>}</>}
 <Action secondary title={tr("Close payment history")} onPress={()=>{setOpen(false);setSelected(null);}}/></Screen></Modal></>;
}
export function DoctorPayments({uid}:{uid:string}){
  useLocale();
 const s=usePayments(uid),alive=useRef(true),lock=useRef(false),[fee,setFee]=useState<ConsultationFee|null>(null),[text,setText]=useState(''),[summary,setSummary]=useState<Awaited<ReturnType<typeof s.summary>>|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false);
 useEffect(()=>()=>{alive.current=false;},[]);
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{await task();}catch(e){if(alive.current)setError(paymentError(e));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function load(){const [f,totals]=await Promise.all([s.fee(uid),s.summary()]);if(alive.current){setFee(f);setText(f?`${Math.trunc(f.amountMinor/100)}.${String(f.amountMinor%100).padStart(2,'0')}`:'');setSummary(totals);setLoaded(true);}}
 useEffect(()=>{void run(load);},[]);
 return <Card><Copy variant="heading">{tr("Consultation fee & demo payments")}</Copy><Copy>{tr("Simulation only. These totals do not represent real earnings or settlement.")}</Copy><Notice message={error}/>{busy&&<Loading/>}<Field label={tr("Consultation fee per 30 minutes (KSh)")} value={text} onChangeText={v=>{setText(v);setSaved(false);}} keyboardType="decimal-pad" helperText={tr("Set 0 for free, or KSh 1–100,000. 15 minutes costs half (rounded up to a minor unit); 60 minutes costs double. Changes apply only to new checkouts.")} editable={!busy}/><Action title={tr("Save consultation fee")} disabled={busy||!loaded||!text} onPress={()=>{let amount:number;try{amount=parseKsh(text);}catch(e){setError((e as Error).message);return;}void run(async()=>{const f=await s.setFee(amount,fee?.revision??0);if(alive.current){setFee(f);setSaved(true);}});}}/>{saved&&<Copy accessibilityLiveRegion="polite">{tr("Consultation fee saved.")}</Copy>}
 {summary&&<><Copy>{tr("Confirmed demo consultations:")}{' '}{formatKsh(summary.confirmed.minor)}</Copy><Copy>{tr("Refunded:")}{' '}{formatKsh(summary.refunded.minor)}</Copy><Copy>{tr("Refunds pending:")}{' '}{formatKsh(summary.refundPending.minor)}</Copy><Copy>{tr("Refunds needing retry:")}{' '}{formatKsh(summary.refundFailed.minor)}</Copy></>}<Action secondary title={tr("Refresh fee and demo summary")} disabled={busy} onPress={()=>{void run(load);}}/><PaymentHistory uid={uid} allowCancel={false}/></Card>;
}
