import {isHostedAcademicDemo} from '../services/academicDemo';
import {ACADEMIC_NOTICE} from '../services/academicNotice';
import React,{useState} from 'react';
import {Modal,Pressable,ScrollView,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Action,Copy,usePalette} from '../ui/design';
import {CONSENT_VERSION,type ConsentChoice} from '../services/patientConsent';

const developmentPrivacyDraft=`DEVELOPMENT DRAFT — NOT LEGALLY APPROVED
Version: ${CONSENT_VERSION}

CallADoc is a telemedicine development application intended for use in Kenya. This notice is for synthetic emulator testing only. Legal review and approval are required before real patient use.

The current application processes account names and email addresses, optional profile pictures, appointment information, consultation messages and call signalling, prescriptions, and health-profile information you choose to enter. Authentication and access controls restrict these records by user and consultation. Acknowledging this notice does not authorize every use of this information.

Existing appointments, consultation chat, prescriptions and appointment-bound patient names/photos continue under their existing access rules. Their lawful processing grounds have not yet been approved; preserving functionality is not a claim of legal compliance.

Medical-record sharing is optional and currently disabled. A development choice records your preference, not permission for an unimplemented sharing service.

Privacy & Consent in your profile lets you review and change your decision. Withdrawal does not automatically delete clinical records, cancel appointments or interrupt unrelated consultations.

Before production: identify the data controller and privacy contact; approve lawful grounds and notices; define retention, recipients, hosting and international transfers; establish rights-request and complaint procedures, child/guardian safeguards, incident response and security governance. These unresolved items are not an approved policy.`;
export const privacyDraft=isHostedAcademicDemo()?ACADEMIC_NOTICE:developmentPrivacyDraft;
export const sharingDraft=`DEVELOPMENT CONSENT INFORMATION — NOT LEGALLY APPROVED
Version: ${CONSENT_VERSION}

Proposed scope: relevant medical records supplied by you, shared for consultation and treatment only with authorized, verified doctors involved in your consultations. This does not authorize unrelated doctors, advertising, research or other optional uses.

Allow and Decline are separate choices. Declining does not prevent account creation or existing consultation functions. You may withdraw a grant in Privacy & Consent. Withdrawal stops future sharing governed by this choice; it does not erase retained records or revoke information already received. The applicable lawful grounds and retention requirements need legal review.

Medical-record sharing remains disabled for every choice, including Allow, until policy approval and tested appointment-bound access controls exist. Use synthetic records only during development.`;

export function PrivacyDocuments(){
 const p=usePalette(),[document,setDocument]=useState<'privacy'|'sharing'|null>(null);
 return <><Pressable accessibilityRole="link" accessibilityLabel={isHostedAcademicDemo()?"Read hosted academic privacy notice":"Read development privacy notice"} onPress={()=>setDocument('privacy')} style={{minHeight:48,justifyContent:'center'}}><Copy style={{color:p.accent}}>{isHostedAcademicDemo()?"Read hosted academic privacy notice":"Read development privacy notice"}</Copy></Pressable>
 <Pressable accessibilityRole="link" accessibilityLabel="Read data-sharing information" onPress={()=>setDocument('sharing')} style={{minHeight:48,justifyContent:'center'}}><Copy style={{color:p.accent}}>Read data-sharing information</Copy></Pressable>
 <Modal visible={document!==null} animationType="slide" onRequestClose={()=>setDocument(null)}><SafeAreaView style={{flex:1,backgroundColor:p.background}}><ScrollView contentContainerStyle={{padding:24,gap:16}}><Copy title>{document==='privacy'?'Privacy notice':'Medical-record sharing'}</Copy><Copy>{document==='privacy'?privacyDraft:sharingDraft}</Copy><Action title="Close information" onPress={()=>setDocument(null)}/></ScrollView></SafeAreaView></Modal></>;
}
export function PatientConsentControls({value,onChange,disabled=false,showHeading=true,noticeOnly=false}:{value:ConsentChoice;onChange:(v:ConsentChoice)=>void;disabled?:boolean;showHeading?:boolean;noticeOnly?:boolean}){
 const p=usePalette();
 const option=(label:string,selected:boolean,role:'checkbox'|'radio',onPress:()=>void)=><Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={onPress} style={{minHeight:48,padding:12,borderWidth:1,borderRadius:12,borderColor:selected?p.accent:p.inputBorder,backgroundColor:selected?p.mint:p.surface}}><Copy>{selected?'✓  ':'○  '}{label}</Copy></Pressable>;
 return <View style={{gap:12}}>{showHeading&&<Copy variant="heading">Privacy & Consent</Copy>}<Copy tone="muted">{isHostedAcademicDemo()?"Restricted academic testing: synthetic data only. Medical-record sharing is disabled.":"Development documents ? legal approval pending. Medical-record sharing is not enabled."}</Copy><PrivacyDocuments/>
 {option(isHostedAcademicDemo()?'I acknowledge the hosted academic privacy notice':'I acknowledge the development privacy notice',value.privacyAcknowledged,'checkbox',()=>onChange({...value,privacyAcknowledged:!value.privacyAcknowledged}))}
 {!noticeOnly&&<><Copy>Optional medical-record sharing with authorized, verified treating doctors. Choose one; declining does not prevent registration.</Copy>
 {option('Allow optional medical-record sharing',value.sharingDecision==='granted','radio',()=>onChange({...value,sharingDecision:'granted'}))}
 {option('Decline optional medical-record sharing',value.sharingDecision==='declined','radio',()=>onChange({...value,sharingDecision:'declined'}))}</>}</View>;
}
