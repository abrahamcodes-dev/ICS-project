const {askChatbot,createHealthChatSession}=require('../src/services/chatbotService');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');

test.each([
 ['What are signs of an eating disorder?','mental-eating-disorders','signs'],
 ['What causes a cold?','disease-common-cold','causes'],
 ['Explain a cold','disease-common-cold',undefined],
 ['What is the common cold?','disease-common-cold',undefined],
 ['Tell me about bulimia','mental-eating-disorders',undefined],
])('explicit educational topic: %s',(query,id,facet)=>{
 const result=askChatbot(query);expect(result.knowledgeId).toBe(id);expect(result.followUp).toBe(facet);
 expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);expect(askChatbot(query)).toEqual(result);
});

test.each(['What causes eczema?','What about eczema?','What causes diabetes?','cold weather','cold water','cold feet','cold sores'])('unsupported explicit topic/aspect does not borrow old context: %s',query=>{
 const session=createHealthChatSession();session.ask('Explain malaria');
 const reply=session.ask(query);expect(reply.intent).toBe('unknown');expect(reply.knowledgeId).toBeUndefined();
 expect(reply.response).toContain('verified CallADoc doctor');expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
 expect(session.ask('What causes it?').intent).toBe('clarification');
});

test.each(['cold','What is cold?','nursing','What causes it?','What causes?','What about that one?','malaria and common cold'])('ambiguity or missing context stays conservative: %s',query=>{
 const result=askChatbot(query);expect(result.intent).toBe('clarification');expect(result.knowledgeId).toBeUndefined();expect(result.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
});

test('cold context uses only its supported fixed answers and remains session-local',()=>{
 const session=createHealthChatSession();session.ask('What is a common cold?');
 const result=session.ask('What causes it?');expect(result.knowledgeId).toBe('disease-common-cold');expect(result.followUp).toBe('causes');
 expect(session.ask('What about children?').intent).toBe('clarification');
 expect(createHealthChatSession().ask('What causes it?').intent).toBe('clarification');
 session.ask('Explain a cold');session.reset();expect(session.ask('What causes it?').intent).toBe('clarification');
});

test.each(['common cold','eating disorder'])('new topic preserves emergency and clinical boundaries: %s',topic=>{
 for(const query of [`${topic} and my baby is not breathing`,`${topic} and pain in my chest`])expect(askChatbot(query).emergency).toBe(true);
 expect(askChatbot(`Do I have ${topic}?`).intent).toBe('diagnosis');
 expect(askChatbot(`What dose should I take for ${topic}?`).intent).toBe('medication');
});
