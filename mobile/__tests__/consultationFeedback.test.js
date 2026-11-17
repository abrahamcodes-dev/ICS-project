const {classifyHistoryFailure}=require('../src/services/consultationFeedback');
test.each([
 [{code:'permission-denied',message:'Missing or insufficient permissions'},'access'],
 [{code:'permission-denied',message:'maximum of 1000 expressions to evaluate has been reached'},'rules-limit'],
 [{code:'failed-precondition',message:'The query requires an index'},'index'],
 [{code:'unavailable'},'connection'],[{code:'resource-exhausted'},'service-limit'],
 [new Error('Invalid consultation message received.'),'data'],[new Error('Unexpected failure'),'unknown'],
])('classifies the actual failure without guessing connectivity: %j',(error,kind)=>expect(classifyHistoryFailure(error)).toBe(kind));
