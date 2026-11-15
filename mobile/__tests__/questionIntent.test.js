const {askChatbot,createHealthChatSession}=require('../src/services/chatbotService');
const {followUpKind,normalizeHealthText}=require('../src/services/healthMatcher');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
const {HEALTH_KNOWLEDGE_BASE:entries}=require('../src/knowledge/healthKnowledgeBase');

test.each([
 ['What is malaria?','definition'],['What causes malaria?','causes'],['What are signs of poor sleep?','signs'],
 ['What are the benefits of broccoli?','benefits'],['What nutrients are in pizza?','nutrients'],
 ['How many hours of sleep are good for me?','duration'],['How often should I eat broccoli?','frequency'],
 ['How can I prevent malaria?','prevention'],['Is pizza safe?','safety'],['Any limitations?','limitations'],
 ['How can I prepare broccoli?','preparation'],['How can I make pizza healthier?','alternatives'],
 ['Explain the benefits of sleep','benefits'],['Tell me about malaria prevention','prevention'],
 ['Tell me how to prepare pizza','preparation'],['Explain the causes of malaria','causes'],
 ['Tell me if pizza is safe','safety'],
])('question classifier: %s',(query,intent)=>expect(followUpKind(normalizeHealthText(query))).toBe(intent));

test.each(['How many hours of sleep are good for me?','How much sleep do I need?','How long should adults sleep?','What is the recommended sleep duration?','How long should I be sleeping?'])('duration answers the requested facet with qualified age groups: %s',query=>{
 const result=askChatbot(query);expect(result.knowledgeId).toBe('general-sleep');expect(result.followUp).toBe('duration');
 expect(result.response).toContain('ages 18–60, 7 or more hours');expect(result.response).toContain('ages 61–64, 7–9 hours');
 expect(result.response).toContain('ages 65 and older, 7–8 hours');expect(result.response).toContain('Without assuming your age');
 expect(result.response).not.toContain('You need 7');expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test.each(['Is pizza good for me?','Is pizza healthy?','Tell me about pizza'])('pizza avoids blanket or personal judgments: %s',query=>{
 const result=askChatbot(query);expect(result.knowledgeId).toBe('nutrition-pizza');expect(result.response).toContain('portion size');
 expect(result.response).toContain('overall dietary pattern');expect(result.response).toContain('ingredients');
 expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test.each(['How often should I eat broccoli?','How long should I cook broccoli?','What causes broccoli?','What nutrients are in sleep?','What are the signs of malaria?'])('missing requested answer never substitutes generic topic text: %s',query=>{
 const result=askChatbot(query);expect(result.intent).toBe('unknown');expect(result.knowledgeId).toBeUndefined();expect(result.response).toContain('verified CallADoc doctor');
});
test('explicit topic and facet override previous topic',()=>{
 const session=createHealthChatSession();session.ask('Explain broccoli');
 expect(session.ask('How many hours of sleep are good for me?').followUp).toBe('duration');
 expect(session.ask('What nutrients are in pizza?').knowledgeId).toBe('nutrition-pizza');
 const result=session.ask('Are there healthier alternatives to pizza?');expect(result.followUp).toBe('alternatives');expect(result.response).toContain('vegetable toppings');
 expect(session.ask('What nutrients are in dragonfruit?').intent).toBe('unknown');
 expect(session.ask('What nutrients are in it?').intent).toBe('clarification');
});
test('ellipsis, unsupported facets and reset remain isolated',()=>{
 const a=createHealthChatSession(),b=createHealthChatSession();a.ask('Explain sleep');expect(a.ask('How many hours?').followUp).toBe('duration');
 expect(b.ask('How many hours?').intent).toBe('clarification');
 a.ask('Explain pizza');expect(a.ask('How often should I eat it?').intent).toBe('clarification');
 a.ask('Explain sleep');a.reset();expect(a.ask('How many hours?').intent).toBe('clarification');
});
test.each(['sleep and pizza','What causes and what are the signs of poor sleep?','What nutrients and benefits does pizza have?','Explain the benefits and limitations of pizza'])('mixed topics/intents require clarification: %s',query=>expect(askChatbot(query).intent).toBe('clarification'));
test.each([
 ['How many hours sleep if my baby is not breathing?','emergency'],
 ['Pizza and pain in my chest','emergency'],['How many sleeping pills should I take?','medication'],
 ['Do I have insomnia?','diagnosis'],['Pizza diet to lose weight','nutrition_boundary'],['Is pizza safe with my allergy?','nutrition_boundary'],
])('safety precedes question classification: %s',(query,intent)=>{
 const result=askChatbot(query);expect(result.intent).toBe(intent);expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('sleep signs use fixed quality guidance, never a diagnosis',()=>{
 const result=askChatbot('What are the signs of sleep deprivation?');expect(result.followUp).toBe('signs');
 expect(result.response).toContain('do not diagnose sleep deprivation');
 expect(result.response).toBe(`${entries.find(e=>e.id==='general-sleep').followUps.signs}\n\n${MEDICAL_DISCLAIMER}`);
});
test('unknown-age duration is not repurposed as child advice',()=>{
 const reply=askChatbot('How many hours should my baby sleep?');expect(reply.intent).toBe('clarification');
 expect(reply.response).not.toContain('7 or more hours');
});
test('adjectival safe water wording is not misclassified as a safety question',()=>{
 const query='Why is safe drinking water important?';expect(followUpKind(normalizeHealthText(query))).toBeUndefined();
 expect(askChatbot(query).knowledgeId).toBe('nutrition-hydration');
});
test.each(['How much sleep should a teenager get?','I am 14, how many hours should I sleep?','How long should a 12 year old sleep?'])('adult-only answer is not used for a stated minor: %s',query=>{
 const reply=askChatbot(query);expect(reply.intent).toBe('clarification');expect(reply.response).not.toContain('7 or more hours');
 expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
