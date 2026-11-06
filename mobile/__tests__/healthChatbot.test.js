const {askChatbot,CHATBOT_LIMIT,CHATBOT_WELCOME,withMedicalDisclaimer}=require('../src/services/chatbotService');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
test.each([
 ['HELLO!','greeting'],['healthy eating','nutrition'],['washing my hands','hygiene'],
 ['sleep routine','sleep'],['feeling anxious','stress'],['antenatal checkup','pregnancy'],
 ['a fever','symptoms'],['book an appointment','consultation'],
 ['what dose of paracetamol','medication'],['diagnose me','diagnosis'],
 ['quantum physics','unknown'],['this shipment','unknown'],['bonjour','unknown'],
])('%s has deterministic intent %s',(query,intent)=>{
 const reply=askChatbot(query);expect(reply.intent).toBe(intent);expect(askChatbot(query)).toEqual(reply);
 expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 expect(reply.response.endsWith(MEDICAL_DISCLAIMER)).toBe(true);
});
test.each([
 'chest pain and diet','I can’t breathe','I cannot breathe','shortness of breath','severe bleeding',
 'slurred speech','unconscious','overdose on pills','I want to kill myself','self-harm',
 'swollen tongue','stress and chest pressure','no chest pain','ＣＨＥＳＴ ＰＡＩＮ',
])('emergency takes priority: %s',query=>{
 const reply=askChatbot(query);expect(reply.emergency).toBe(true);
 expect(reply.response).toContain('immediate professional help');expect(reply.response).toContain('Do not wait');
 expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test.each([
 'My baby is not breathing','pain in my chest','I took too many pills','I ate fruit and my throat is swelling',
 'MY BABY IS NOT BREATHING!','My infant isn\'t breathing','The baby has stopped breathing',
 'There is pressure in her chest','I have taken too many sleeping tablets','I swallowed too many pills',
 'My tongue is swelling','My throat feels swollen','My throat is getting swollen',
 'My baby is not breathing and I need nutrition tips','Pain in my chest after eating vegetables',
 'I took too many pills to help me sleep','I ate fruit and my throat is swelling; what medicine should I take?',
 'I did not take too many pills','I have no pain in my chest','My baby is not breathing poorly',
])('documented emergency/paraphrase has priority, including negation: %s',query=>{
 const result=askChatbot(query);expect(result.intent).toBe('emergency');expect(result.emergency).toBe(true);
 expect(result.response).toContain('nearest emergency department');expect(result.response).toContain('Do not wait');
 expect(result.response.indexOf('immediate professional help')).toBeLessThan(result.response.indexOf(MEDICAL_DISCLAIMER));
 expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test.each(['healthy eating with normal breathing','I take my prescribed pills','How to store tablets?','Fruit is part of my diet'])('ordinary topic is not escalated by an isolated new keyword: %s',query=>{
 expect(askChatbot(query).emergency).toBe(false);
});
test('possible overdose does not tell an asymptomatic user to wait for symptoms',()=>{
 const result=askChatbot('I took too many pills but have no symptoms');
 expect(result.emergency).toBe(true);expect(result.response).toContain('even if there are no symptoms');
 expect(result.response).toContain('non-emergency concerns only');
});
test('welcome and repeated composition contain the approved disclaimer exactly once',()=>{
 expect(CHATBOT_WELCOME.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 const once=withMedicalDisclaimer('General information.');expect(withMedicalDisclaimer(once)).toBe(once);
 expect(withMedicalDisclaimer(once).split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('unsupported questions recommend a verified CallADoc doctor without reassuring',()=>{
 const result=askChatbot('quantum physics');expect(result.intent).toBe('unknown');
 expect(result.response).toContain('verified CallADoc doctor');expect(result.response).toContain('cannot rule out a serious problem');
 expect(result.response).toContain('do not wait');
});
test.each(['','   ',null,42,'a'.repeat(CHATBOT_LIMIT+1)])('rejects invalid input %p',query=>expect(()=>askChatbot(query)).toThrow());
test('maximum length accepted and unknown response does not reassure',()=>{
 expect(askChatbot('x'.repeat(CHATBOT_LIMIT)).response).toContain('cannot rule out');
});
test('dosing and diagnostic requests never produce a treatment plan',()=>{
 expect(askChatbot('what medication for sleep').response).toContain('cannot choose medicines');
 expect(askChatbot('do I have malaria').response).toContain('cannot identify an illness');
});
