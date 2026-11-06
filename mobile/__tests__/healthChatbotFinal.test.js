const {askChatbot,createHealthChatSession}=require('../src/services/chatbotService');
const {canonicalHealthText,normalizeHealthText}=require('../src/services/healthMatcher');
const {HEALTH_KNOWLEDGE_BASE:entries}=require('../src/knowledge/healthKnowledgeBase');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');

test.each([
 'Explain raised blood pressure','General information about RAISED BLOOD PRESSURE',
 'Why is raised blood pressure important',
])('unambiguous terminology: %s',query=>{
 const response=askChatbot(query);
 expect(response.knowledgeId).toBe('disease-hypertension');
 expect(response.response).toContain('professional assessment');
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('raised pressure normalization is bounded and idempotent',()=>{
 const normalized=canonicalHealthText(normalizeHealthText('Raised blood pressure!'));
 expect(normalized).toBe('high blood pressure');
 expect(canonicalHealthText(normalized)).toBe(normalized);
 expect(canonicalHealthText('raised pressure')).toBe('raised pressure');
 expect(askChatbot('Explain raised pressure').intent).toBe('clarification');
});
test.each(['Explain nursing','What is nursing a baby','Tell me about nursing care','Nursing for infants'])('ambiguous terminology clarifies: %s',query=>{
 const response=askChatbot(query);
 expect(response.intent).toBe('clarification');expect(response.knowledgeId).toBeUndefined();
 expect(response.response).toContain('verified CallADoc doctor');
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('explicit breastfeeding wording resolves nursing ambiguity',()=>{
 expect(askChatbot('Information about nursing meaning breastfeeding').knowledgeId).toBe('child-breastfeeding');
});
test.each([
 ['Nursing a baby who is not breathing','emergency'],
 ['Raised blood pressure and pain in my chest','emergency'],
 ['What dose for raised blood pressure','medication'],
 ['Do I have raised blood pressure','diagnosis'],
 ['What medicine for nursing a baby','medication'],
 ['Can you diagnose my nursing baby','diagnosis'],
])('safety precedes terminology: %s',(query,intent)=>{
 const response=askChatbot(query);expect(response.intent).toBe(intent);
 expect(response.knowledgeId).toBeUndefined();expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('ambiguous nursing clears a previously identified topic',()=>{
 const session=createHealthChatSession();session.ask('Explain malaria');
 expect(session.ask('Information on nursing a baby').intent).toBe('clarification');
 expect(session.ask('What causes it').intent).toBe('clarification');
});
const questions={causes:'What causes it',prevention:'How can I prevent it',children:'What about children',care:'When should I see a doctor'};
const followUps=entries.flatMap(entry=>Object.entries(entry.followUps).map(([kind,response])=>[entry.id,kind,response,entry.exampleQuestion]));
test('the final catalog has exactly 31 entries and ten supported follow-up answers',()=>{
 expect(entries).toHaveLength(31);expect(followUps).toHaveLength(10);
});
test.each(followUps)('all supported follow-ups are reachable with one disclaimer: %s/%s',(id,kind,response,topic)=>{
 const session=createHealthChatSession();session.ask(topic);
 const result=session.ask(questions[kind]);
 expect(result.knowledgeId).toBe(id);expect(result.followUp).toBe(kind);
 expect(result.response).toBe(`${response}\n\n${MEDICAL_DISCLAIMER}`);
 expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 const entry=entries.find(item=>item.id===id);
 expect(entry.reviewStatus).toBe('pending_clinical_review');expect(entry.sources.length).toBeGreaterThan(0);
});
