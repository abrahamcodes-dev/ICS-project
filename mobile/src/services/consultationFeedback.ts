/** Classify SDK failures without displaying raw messages or clinical content. */
export type HistoryFailure = 'access'|'rules-limit'|'service-limit'|'index'|'connection'|'data'|'unknown';
export function classifyHistoryFailure(error: unknown): HistoryFailure {
  const value=error as {code?:unknown;message?:unknown}|null;
  const code=typeof value?.code==='string'?value.code.replace(/^firestore\//,''):'';
  const message=typeof value?.message==='string'?value.message:'';
  if(/maximum of 1000 expressions|expression.*(?:budget|limit)/i.test(message))return 'rules-limit';
  if(code==='permission-denied'||code==='unauthenticated')return 'access';
  if(code==='failed-precondition'&&/index/i.test(message))return 'index';
  if(code==='resource-exhausted')return 'service-limit';
  if(['unavailable','deadline-exceeded','network-request-failed'].includes(code))return 'connection';
  if(/Invalid consultation message|Document message binding changed/.test(message))return 'data';
  return 'unknown';
}
