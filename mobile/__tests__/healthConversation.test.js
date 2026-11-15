const {askChatbot,createHealthChatSession}=require('../src/services/chatbotService');
const {normalizeHealthText,canonicalHealthText,rankHealthKnowledge}=require('../src/services/healthMatcher');
const {HEALTH_KNOWLEDGE_BASE:entries}=require('../src/knowledge/healthKnowledgeBase');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');

// Development fixtures: used to implement/debug the explicit rules. These are
// separate from the reserved evaluation file; neither is clinical validation.
const developmentCases=[
 ['paraphrase','Could you explain trouble sleeping','general-sleep'],
 ['paraphrase','Tell me about breast feeding','child-breastfeeding'],
 ['synonym','What does high BP mean','disease-hypertension'],
 ['synonym','Explain runny stools','general-diarrhoea'],
 ['synonym','I need tips for feeling worried','mental-anxiety'],
 ['spelling','Tell me about malairia','disease-malaria'],
 ['spelling','What is diabtes','disease-diabetes'],
 ['spelling','Explain hypertensoin','disease-hypertension'],
 ['spelling','What is a headace','general-headache'],
 ['specificity','What is vaccination for a baby','child-vaccination'],
 ['specificity','Explain complementary feeding for babies','child-complementary-feeding'],
 ['specificity','What are the benefits of fibre in a diet','nutrition-fibre'],
 ['specificity','Explain depression and mental health','mental-depression'],
 ['mixed','Explain flu and fever','clarification'],
 ['mixed','Tell me about salt and anxiety','clarification'],
 ['mixed','Explain malaria and astronomy','clarification'],
 ['mixed','Explain sleep or astronomy','clarification'],
 ['mixed','Tell me about diet but also orbital velocity','clarification'],
 ['ambiguous','Can you explain pressure','clarification'],
 ['ambiguous','Tell me about nursing','clarification'],
 ['unsupported','What is malarix','unknown'],
 ['unsupported','Does a mythic herb work','unknown'],
];
test.each(developmentCases)('[development:%s] %s',(_,query,expected)=>{
 const response=askChatbot(query);
 expect(response.knowledgeId||response.intent).toBe(expected);
 expect(askChatbot(query)).toEqual(response);
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});
test('scoring uses specificity, meaningful coverage and priority, independent of catalog order',()=>{
 const query='healthy eating with beans and whole grains';
 const ranked=rankHealthKnowledge(query);
 expect(ranked[0].entry.id).toBe('nutrition-grains');
 expect(ranked[0].coverage).toBeGreaterThan(ranked[1].coverage);
 expect(ranked.map(item=>[item.entry.id,item.score])).toEqual(rankHealthKnowledge(query,undefined,[...entries].reverse()).map(item=>[item.entry.id,item.score]));
});
test('sparse meaningful evidence does not force a wellness response',()=>{
 expect(askChatbot('a satellite telescope planet rocket orbit atmosphere astronaut galaxy universe laboratory sleep').intent).toBe('clarification');
});
test.each([
 'Healthy eating but pain in my chest', 'I have anxiety and cannot catch my breath',
 'My baby is not brething', 'I took too many pills and want sleep tips',
 'I have no chest pain and ask about malaria', 'Malairia and my throat is swelling',
])('[safety] emergency precedes normalization, scoring and context: %s',query=>{
 const session=createHealthChatSession();session.ask('What is malaria');
 const response=session.ask(query);expect(response.intent).toBe('emergency');
 expect(response.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 expect(session.ask('How can I prevent it').intent).toBe('clarification');
});
test.each([
 ['What dosge for malairia','medication'],['Can I take paracetemol for headace','medication'],
 ['What are antibiotcs','medication'],['Do I have hypertensoin','diagnosis'],
 ['Could I have diabtes','diagnosis'],['How to treat runny stools','diagnosis'],
 ['What are antibiotics and what dose should I use','medication'],
])('[safety] correction never bypasses clinical boundaries: %s',(query,intent)=>{
 expect(askChatbot(query).intent).toBe(intent);expect(askChatbot(query).knowledgeId).toBeUndefined();
});
test('normalization is idempotent and unknown spellings are never guessed',()=>{
 const value=canonicalHealthText(normalizeHealthText('HIGH BP and malairia!'));
 expect(canonicalHealthText(value)).toBe(value);
 expect(canonicalHealthText('malaryx')).toBe('malaryx');
});
test.each([
 ['What causes it','causes','parasites'],['How can I prevent it','prevention','nets'],
 ['What about children','children','Young children'],['When should I see a doctor','care','testing'],
])('[follow-up] malaria: %s',(question,facet,copy)=>{
 const session=createHealthChatSession();session.ask('What is malaria');
 const result=session.ask(question);
 expect(result.knowledgeId).toBe('disease-malaria');expect(result.followUp).toBe(facet);
 expect(result.response).toContain(copy);expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 const entry=entries.find(entry=>entry.id===result.knowledgeId);
 expect(result.response).toBe(`${entry.followUps[facet]}\n\n${MEDICAL_DISCLAIMER}`);
 expect(entry.reviewStatus).toBe('pending_clinical_review');expect(entry.sources.length).toBeGreaterThan(0);
});
test('follow-ups can chain, but a new explicit topic replaces context',()=>{
 const session=createHealthChatSession();session.ask('What is malaria');
 expect(session.ask('How can I prevent it').followUp).toBe('prevention');
 expect(session.ask('What about children').followUp).toBe('children');
 session.ask('General information about cough');
 expect(session.ask('When should I see a doctor').knowledgeId).toBe('general-cough');
 expect(session.ask('What causes it').intent).toBe('clarification');
});
test.each(['What causes it','What about children','How can I prevent it'])('[follow-up] missing topic/unsupported diabetes facet: %s',question=>{
 expect(askChatbot(question).intent).toBe('clarification');
 const session=createHealthChatSession();session.ask('Explain diabetes');
 const result=session.ask(question);expect(result.intent).toBe('clarification');expect(result.knowledgeId).toBeUndefined();
});
test('explicit topic/facet uses its own fixed answer and never old context',()=>{
 const session=createHealthChatSession();session.ask('Explain diabetes');
 expect(session.ask('What causes malaria').followUp).toBe('causes');
 expect(session.ask('What causes diabetes').intent).toBe('unknown');
});
test.each(['Reset','unknown','ambiguous','medication','diagnosis'])('[isolation] %s invalidates the old topic',kind=>{
 const session=createHealthChatSession();session.ask('Explain malaria');
 if(kind==='Reset')session.reset();
 else session.ask({unknown:'quantum physics',ambiguous:'malaria and diabetes',medication:'what dose',diagnosis:'do I have malaria'}[kind]);
 expect(session.ask('How can I prevent it').intent).toBe('clarification');
});
test('sessions and stateless callers never share context',()=>{
 const one=createHealthChatSession(),two=createHealthChatSession();
 one.ask('Explain malaria');two.ask('Explain diabetes');
 expect(one.ask('What causes it').knowledgeId).toBe('disease-malaria');
 expect(two.ask('What causes it').intent).toBe('clarification');
 expect(askChatbot('What causes it').intent).toBe('clarification');
});
test('unsupported extra clauses in a follow-up never reuse the topic',()=>{
 const session=createHealthChatSession();session.ask('Explain malaria');
 expect(session.ask('What causes it and can I fly tomorrow').intent).toBe('clarification');
});
