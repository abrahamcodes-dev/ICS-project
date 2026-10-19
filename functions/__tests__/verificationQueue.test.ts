import {createVerificationQueue, QueueTransaction} from '../src/profiles/verificationQueue';
import {fixture, identity} from './helpers/verificationFixture';

async function setup() {
  const f = fixture(); await f.submit();
  const record = f.requests()[0];
  const documentId = record.requestId;
  const tx: QueueTransaction = {identity: jest.fn(async () => identity('admin', 'administrator')),
    list: jest.fn(async () => [{id: documentId, data: record}])};
  const handler = createVerificationQueue(async work => work(tx));
  return {f, tx, record, call: (data: unknown = {}, auth: {uid: string} | undefined = {uid: 'admin'}) => handler({auth, data}), handler};
}
test('active canonical administrator receives only review information', async () => {
  const s = await setup(); const page = await s.call();
  expect(s.tx.list).toHaveBeenCalledWith(11, undefined);
  expect(page.nextCursor).toBeNull();
  expect(Object.keys(page.items[0]).sort()).toEqual(['requestId','doctorUid','profileRevision','professional','credentials','submittedAt'].sort());
  expect(page.items[0].professional).not.toHaveProperty('phoneNumber');
});
test('unauthenticated request never queries Firestore', async () => {
  const s = await setup(); await expect(s.handler({data: {}})).rejects.toMatchObject({code: 'unauthenticated'});
  expect(s.tx.list).not.toHaveBeenCalled();
});
test.each(['patient', 'doctor', 'admin'])('%s cannot discover requests', async role => {
  const s = await setup(); (s.tx.identity as jest.Mock).mockResolvedValue(identity('admin', role));
  await expect(s.call()).rejects.toMatchObject({code: 'permission-denied'}); expect(s.tx.list).not.toHaveBeenCalled();
});
test.each([null, identity('admin','administrator',{status:'disabled'}), identity('other','administrator'), {role:'administrator'}])('invalid or disabled canonical identity denied %#', async value => {
  const s = await setup(); (s.tx.identity as jest.Mock).mockResolvedValue(value);
  await expect(s.call()).rejects.toMatchObject({code:'permission-denied'}); expect(s.tx.list).not.toHaveBeenCalled();
});
test.each([{limit:0},{limit:21},{limit:1.5},{limit:'10'},{after:'../x'},{after:''},{offset:10},{role:'administrator'},null])('invalid queue input denied %#', async data => {
  const s = await setup(); await expect(s.call(data)).rejects.toMatchObject({code:'invalid-argument'}); expect(s.tx.list).not.toHaveBeenCalled();
});
test('bounded lookahead returns a stable document-ID cursor', async () => {
  const s = await setup(); (s.tx.list as jest.Mock).mockResolvedValue(['b','c','d'].map(id => ({id,data:{...s.record,requestId:id}})));
  const page = await s.call({limit:2,after:'a'});
  expect(s.tx.list).toHaveBeenCalledWith(3,'a'); expect(page.items.map(row=>row.requestId)).toEqual(['b','c']); expect(page.nextCursor).toBe('c');
});
test('empty result has no cursor', async () => {
  const s=await setup(); (s.tx.list as jest.Mock).mockResolvedValue([]); expect(await s.call()).toEqual({items:[],nextCursor:null});
});
test.each([{requestId:'different'},{state:'approved'},{credentials:[]},{professional:{professionalName:'x'}}])('corrupt request fails closed %#',async change=>{
  const s=await setup();Object.assign(s.record,change);await expect(s.call()).rejects.toMatchObject({code:'failed-precondition'});
});
