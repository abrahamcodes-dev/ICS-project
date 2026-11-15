const {HEALTH_KNOWLEDGE_BASE: entries, HEALTH_KNOWLEDGE_VERSION, HEALTH_SOURCES}=require('../src/knowledge/healthKnowledgeBase');
const {CHATBOT_CATEGORIES}=require('../src/constants/chatbotCategories');
const {askChatbot}=require('../src/services/chatbotService');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');

test.each(CHATBOT_CATEGORIES)('%s contains at least five educational entries',category=>{
 expect(entries.filter(entry=>entry.category===category).length).toBeGreaterThanOrEqual(5);
});
test('stable IDs are unique and metadata is complete, with no clinical approval claim',()=>{
 expect(new Set(entries.map(entry=>entry.id)).size).toBe(entries.length);
 for(const entry of entries){
  expect(entry.id).toMatch(/^[a-z]+-[a-z-]+$/);
  expect(CHATBOT_CATEGORIES).toContain(entry.category);
  expect(entry.contentVersion).toBe(HEALTH_KNOWLEDGE_VERSION);
  expect(entry.reviewStatus).toBe('pending_clinical_review');
  expect(entry.response.length).toBeGreaterThan(60);
  expect(entry.patterns.length).toBeGreaterThan(0);
  entry.patterns.forEach(pattern=>{expect(pattern.global).toBe(false);expect(pattern.sticky).toBe(false);});
  expect(entry.sources.length).toBeGreaterThan(0);
  for(const source of entry.sources){
   expect(Object.values(HEALTH_SOURCES)).toContain(source);
   expect(['WHO','FAO','FAO/Government of Kenya','CDC','Health Canada']).toContain(source.organization);
   expect(source.title.length).toBeGreaterThan(5);
   const host={WHO:/(^|\.)who\.int$/,FAO:/(^|\.)fao\.org$/,'FAO/Government of Kenya':/(^|\.)fao\.org$/,CDC:/(^|\.)cdc\.gov$/,'Health Canada':/(^|\.)canada\.ca$/}[source.organization];
   expect(new URL(source.url).hostname).toMatch(host);
   expect(['2026-11-06','2026-11-07','2026-11-08']).toContain(source.verifiedOn);
  }
 }
});
test.each(entries.map(entry=>[entry.id,entry.exampleQuestion]))('%s is reachable, deterministic and has one disclaimer',(id,question)=>{
 const response=askChatbot(question);
 expect(response.knowledgeId).toBe(id);
 expect(response.contentVersion).toBe(HEALTH_KNOWLEDGE_VERSION);
 expect(response.emergency).toBe(false);
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 expect(response.response.endsWith(MEDICAL_DISCLAIMER)).toBe(true);
 for(let i=0;i<3;i++)expect(askChatbot(question)).toEqual(response);
});
test.each(entries.map(entry=>[entry.id,entry.exampleQuestion]))('emergency overrides %s',(id,question)=>{
 const response=askChatbot(`${question} but my baby is not breathing`);
 expect(response.intent).toBe('emergency');
 expect(response.knowledgeId).toBeUndefined();
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test.each([
 ['Can you diagnose diabetes?','diagnosis'],['Do I have malaria?','diagnosis'],
 ['Could I have hypertension?','diagnosis'],['Does my baby have flu?','diagnosis'],
 ['How to treat tuberculosis?','diagnosis'],['Is this depression?','diagnosis'],
 ['What dose for anxiety?','medication'],['What should I take for malaria?','medication'],
 ['What are antibiotics and how many should I take?','medication'],
 ['What is medication safety and can I stop my tablets?','medication'],
 ['Can I take 10mg for sleep?','medication'],['What medication for fever?','medication'],
 ['Why keep a medicines list and check my interactions?','medication'],
])('clinical boundary overrides educational topics: %s',(question,intent)=>{
 const response=askChatbot(question);
 expect(response.intent).toBe(intent);expect(response.knowledgeId).toBeUndefined();
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test.each([
 ['Benefits of lentils','nutrition-grains'],['Why reduce sodium in food?','nutrition-salt'],
 ['Tell me about prenatal care','maternal-antenatal'],['Information on immunisation','child-vaccination'],
 ['My adolescent needs mental health support','mental-adolescent'],['What is antibiotic resistance?','med-resistance'],
])('specific topic wins over broad keywords: %s',(query,id)=>expect(askChatbot(query).knowledgeId).toBe(id));
test('stateless unsupported follow-up asks for clarification without inventing context',()=>{
 askChatbot('What is malaria?');
 const response=askChatbot('And what about that one?');
 expect(response.intent).toBe('clarification');
 expect(response.knowledgeId).toBeUndefined();
 expect(response.response).toContain('verified CallADoc doctor');
});
