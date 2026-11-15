const {createHealthChatSession}=require('../src/services/chatbotService');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
const dataset=require('./fixtures/nutritionEvaluation.json');
test('reserved synthetic nutrition evaluation: report exact outcomes, not clinical validation',()=>{
 const run=item=>{const session=createHealthChatSession();let result;for(const query of item.turns||[item.query])result=session.ask(query);return result;};
 const results=dataset.cases.map(item=>{const reply=run(item);expect(run(item)).toEqual(reply);expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);const actual=reply.knowledgeId||reply.intent;return {...item,actual,correct:actual===item.expected};});
 console.info('NUTRITION EVALUATION',JSON.stringify({correct:results.filter(x=>x.correct).length,total:results.length,results}));
 expect(results).toHaveLength(32);
});
