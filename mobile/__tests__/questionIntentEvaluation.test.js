const {createHealthChatSession}=require('../src/services/chatbotService');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
const fixture=require('./fixtures/questionIntentEvaluation.json');
test('labelled question-intent evaluation reports topic plus facet accuracy',()=>{
 const evaluate=item=>{const session=createHealthChatSession();let reply;for(const query of item.turns||[item.query])reply=session.ask(query);return reply;};
 const results=fixture.cases.map(item=>{const reply=evaluate(item);expect(evaluate(item)).toEqual(reply);expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);const correct=item.intent?reply.intent===item.intent:reply.knowledgeId===item.topic&&(!item.facet||reply.followUp===item.facet);return {...item,actual:{intent:reply.intent,topic:reply.knowledgeId,facet:reply.followUp},correct};});
 console.info('QUESTION INTENT EVALUATION',JSON.stringify({correct:results.filter(x=>x.correct).length,total:results.length,results}));
 expect(results).toHaveLength(26);
});
