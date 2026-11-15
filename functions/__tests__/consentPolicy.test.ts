import {consentInput,planConsent,DOCUMENT_VERSION} from '../src/privacy/consentPolicy';
const input={requestId:'a'.repeat(20),expectedRevision:0,documentVersion:DOCUMENT_VERSION,privacyAcknowledged:true as const,sharingDecision:'granted' as const,source:'registration' as const};
test('requires explicit acknowledgement, decision and current version',()=>{
 for(const patch of [{privacyAcknowledged:false},{sharingDecision:null},{documentVersion:'old'},{patientUid:'other'},{expectedRevision:-1}])expect(()=>consentInput({...input,...patch})).toThrow();
});
test('allows declining optional sharing with a versioned acknowledgement',()=>{
 const state=planConsent('patient',consentInput({...input,sharingDecision:'declined'}),null,'2026-11-03T00:00:00.000Z');
 expect(state).toMatchObject({patientUid:'patient',sharingDecision:'declined',documentVersion:DOCUMENT_VERSION,revision:1,developmentOnly:true});
});
test('withdrawal preserves history version and enforces revision',()=>{
 const grant=planConsent('patient',input,null,'2026-11-03T00:00:00.000Z');
 expect(()=>planConsent('patient',input,grant,'2026-11-03T01:00:00.000Z')).toThrow(/Reload/);
 expect(planConsent('patient',{...input,expectedRevision:1,sharingDecision:'withdrawn',source:'profile'},grant,'2026-11-03T01:00:00.000Z')).toMatchObject({revision:2,sharingDecision:'withdrawn'});
 expect(planConsent('patient',{...input,expectedRevision:1,sharingDecision:'withdrawn',source:'profile'},grant,'2026-11-03T01:00:00.000Z').privacyAcknowledgedAt).toBe(grant.privacyAcknowledgedAt);
 expect(()=>planConsent('patient',{...input,sharingDecision:'withdrawn'},null,'2026-11-03T01:00:00.000Z')).toThrow();
});
