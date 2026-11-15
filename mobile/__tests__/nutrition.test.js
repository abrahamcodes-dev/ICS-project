const {askChatbot,createHealthChatSession}=require('../src/services/chatbotService');
const {HEALTH_KNOWLEDGE_BASE:entries}=require('../src/knowledge/healthKnowledgeBase');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
const {canonicalHealthText,normalizeHealthText}=require('../src/services/healthMatcher');

test.each([
 ['What foods are good for me?','nutrition-variety'],['What should I eat to stay healthy?','nutrition-variety'],
 ['What are the health benefits of broccoli?','nutrition-broccoli'],['Is broccoli healthy?','nutrition-broccoli'],
 ['What nutrients are in broccoli?','nutrition-broccoli'],['Which foods contain iron?','nutrition-iron'],
 ['What foods are high in protein?','nutrition-protein'],['Are eggs good for you?','nutrition-eggs'],
 ['Is ugali healthy?','nutrition-staples'],['What should I eat for better digestion?','nutrition-fibre'],
 ['What are food groups?','nutrition-variety'],['Explain healthy food choices','nutrition-variety'],
 ['Tell me about spinach','nutrition-leafy-greens'],['Sukuma wiki nutrients','nutrition-leafy-greens'],
 ['Benefits of beans','nutrition-grains'],['Benefits of lentils','nutrition-grains'],['Explain ndengu','nutrition-grains'],
 ['Are bananas healthy?','nutrition-bananas'],['What nutrients are in avocado?','nutrition-avocados'],
 ['What does fish provide?','nutrition-fish'],['What is milk?','nutrition-milk'],
 ['Are oats nutritious?','nutrition-staples'],['Tell me about rice','nutrition-staples'],
 ['What are carbohydrates?','nutrition-carbohydrates'],['What are healthy fats?','nutrition-fats'],
 ['Explain vitamins and minerals','nutrition-micronutrients'],['Explain hydration','nutrition-hydration'],
 ['Explain safe cooking','nutrition-preparation'],
 ['What food hygiene basics should I know?','nutrition-preparation'],
 ['Could you suggest everyday food choices for staying well?','nutrition-variety'],
 ['I want to understand a balanced plate','nutrition-variety'],
 ['Which meals can supply iron?','nutrition-iron'],
])('[development:nutrition] %s',(query,id)=>{
 const result=askChatbot(query);expect(result.knowledgeId).toBe(id);expect(askChatbot(query)).toEqual(result);
 expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});

test.each([['brocolli','nutrition-broccoli'],['spinich','nutrition-leafy-greens'],['avacado','nutrition-avocados'],['protien','nutrition-protein'],['green grams','nutrition-grains'],['mung beans','nutrition-grains'],['sukumawiki','nutrition-leafy-greens']])('controlled spelling/synonym %s',(word,id)=>{
 expect(askChatbot(`Explain ${word}`).knowledgeId).toBe(id);
 const normalized=canonicalHealthText(normalizeHealthText(word));expect(canonicalHealthText(normalized)).toBe(normalized);
});

test.each(['broccoli and malaria','broccoli and dragonfruit','eggs or fish','diet and an eating disorder','broccoli and anorexia','milk for my baby'])('independent/mixed topics clarify without combining advice: %s',query=>{
 expect(askChatbot(query).intent).toBe('clarification');
});
test.each(['Is dragonfruit healthy?','What nutrients are in cassava?','Java beans','protein in urine','iron gate'])('unsupported food or non-food meaning uses safe fallback: %s',query=>{
 const result=askChatbot(query);expect(result.intent).toBe('unknown');expect(result.response).toContain('verified CallADoc doctor');
});
test.each(['broccoli and my baby is not breathing','avocado and pain in my chest','I took too many pills with rice','eggs and my throat is swelling'])('emergency always precedes nutrition: %s',query=>expect(askChatbot(query).emergency).toBe(true));
test.each([['What dose for digestion?','medication'],['Do I have an egg allergy?','diagnosis'],['How to treat diabetes with food?','diagnosis'],['Give me a meal plan','nutrition_boundary'],['Which foods help me lose weight?','nutrition_boundary'],['I want to skip meals and eat only broccoli','nutrition_boundary'],['What should I eat with kidney disease?','nutrition_boundary']])('clinical/restrictive boundary: %s',(query,intent)=>{
 const result=askChatbot(query);expect(result.intent).toBe(intent);expect(result.knowledgeId).toBeUndefined();expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('fixed nutrition facets do not infer unsupported answers or leak session context',()=>{
 const a=createHealthChatSession(),b=createHealthChatSession();a.ask('Tell me about broccoli');
 for(const [query,facet] of [['What are the benefits?','benefits'],['What nutrients are in it?','nutrients'],['How can I prepare it?','preparation'],['Any limitations?','limitations']]){
  const result=a.ask(query);expect(result.knowledgeId).toBe('nutrition-broccoli');expect(result.followUp).toBe(facet);
  expect(result.response).toBe(`${entries.find(e=>e.id==='nutrition-broccoli').followUps[facet]}\n\n${MEDICAL_DISCLAIMER}`);
 }
 expect(b.ask('What nutrients are in it?').intent).toBe('clarification');
 expect(a.ask('What causes it?').intent).toBe('clarification');
 a.ask('Tell me about broccoli');expect(a.ask('What nutrients are in dragonfruit?').intent).toBe('unknown');
 expect(a.ask('What nutrients are in it?').intent).toBe('clarification');
 a.ask('Tell me about broccoli');a.reset();expect(a.ask('How can I prepare it?').intent).toBe('clarification');
});
test.each(['I am allergic to eggs, are they good for me?','Broccoli for cancer','How many eggs should I eat?','Is milk safe with lactose intolerance?'])('food-specific limitations do not become personal recommendations: %s',query=>{
 expect(askChatbot(query).intent).toBe('nutrition_boundary');
});
test('food claims have verified references and retain pending review, without numeric nutrient prescriptions',()=>{
 const nutrition=entries.filter(e=>e.category==='nutrition');expect(nutrition).toHaveLength(22);
 for(const entry of nutrition){expect(entry.sources.length).toBeGreaterThan(0);expect(entry.reviewStatus).toBe('pending_clinical_review');expect(entry.response).not.toMatch(/\d+\s*(mg|grams?|calories|kcal)/);}
});
