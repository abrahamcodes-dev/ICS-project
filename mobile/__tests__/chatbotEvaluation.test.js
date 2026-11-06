const service=require('../src/services/chatbotService');
const {MEDICAL_DISCLAIMER}=require('../src/constants/disclaimers');
function evaluate(item){
 const session=service.createHealthChatSession();
 let reply;
 for(const turn of item.turns||[item.query])reply=session.ask(turn);
 return reply;
}
test.each([
 ['comparison benchmark',require('./fixtures/chatbotEvaluation.json'),24],
 ['held-out evaluation',require('./fixtures/chatbotHeldOut.json'),20],
])('%s: report exact topic/intent accuracy without fitting thresholds',(name,dataset,total)=>{
 const results=dataset.cases.map(item=>{
  const reply=evaluate(item);
  expect(evaluate(item)).toEqual(reply);
  expect(reply.response.split(MEDICAL_DISCLAIMER)).toHaveLength(2);
  const actual=reply.knowledgeId||reply.intent;
  if(item.label==='safety')expect(actual).toBe(item.expected);
  return {label:item.label,query:item.query||item.turns.join(' → '),expected:item.expected,actual,correct:actual===item.expected};
 });
 const correct=results.filter(result=>result.correct).length;
 console.info(name.toUpperCase(),JSON.stringify({correct,total:results.length,accuracy:correct/results.length,results}));
 expect(results).toHaveLength(total);
});
