const {askChatbot,CHATBOT_LIMIT}=require('../src/services/chatbotService');
test.each([
 ['HELLO!','greeting'],['healthy eating','nutrition'],['washing my hands','hygiene'],
 ['sleep routine','sleep'],['feeling anxious','stress'],['antenatal checkup','pregnancy'],
 ['a fever','symptoms'],['book an appointment','consultation'],
 ['what dose of paracetamol','medication'],['diagnose me','diagnosis'],
 ['quantum physics','unknown'],['this shipment','unknown'],['bonjour','unknown'],
])('%s has deterministic intent %s',(query,intent)=>{
 const reply=askChatbot(query);expect(reply.intent).toBe(intent);expect(askChatbot(query)).toEqual(reply);
});
test.each([
 'chest pain and diet','I can’t breathe','I cannot breathe','shortness of breath','severe bleeding',
 'slurred speech','unconscious','overdose on pills','I want to kill myself','self-harm',
 'swollen tongue','stress and chest pressure','no chest pain','ＣＨＥＳＴ ＰＡＩＮ',
])('emergency takes priority: %s',query=>{
 const reply=askChatbot(query);expect(reply.emergency).toBe(true);
 expect(reply.response).toContain('immediate professional help');expect(reply.response).toContain('Do not wait');
});
test.each(['','   ',null,42,'a'.repeat(CHATBOT_LIMIT+1)])('rejects invalid input %p',query=>expect(()=>askChatbot(query)).toThrow());
test('maximum length accepted and unknown response does not reassure',()=>{
 expect(askChatbot('x'.repeat(CHATBOT_LIMIT)).response).toContain('cannot rule out');
});
test('dosing and diagnostic requests never produce a treatment plan',()=>{
 expect(askChatbot('what medication for sleep').response).toContain('cannot choose medicines');
 expect(askChatbot('do I have malaria').response).toContain('cannot identify an illness');
});
