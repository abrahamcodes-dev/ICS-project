jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'), onCall: (handler: unknown) => handler,
}));
jest.mock('../src/shared/firestoreRefs', () => ({db: {runTransaction: jest.fn(), collection: jest.fn()}}));
import {db} from '../src/shared/firestoreRefs';
import {listPendingDoctorVerifications} from '../src/profiles/verificationQueueCallable';
import {identity} from './helpers/verificationFixture';

test('Firestore adapter uses canonical identity and bounded submitted-only document-ID query', async () => {
  const query = {where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), startAfter: jest.fn().mockReturnThis()};
  const identityRef = {};
  (db.collection as jest.Mock).mockImplementation(name => name === 'users' ? {doc: jest.fn(() => identityRef)} : query);
  const get = jest.fn(async ref => ref === identityRef ? {data: () => identity('admin','administrator')} : {docs: []});
  (db.runTransaction as jest.Mock).mockImplementation(work => work({get}));
  await (listPendingDoctorVerifications as unknown as (r: unknown) => Promise<unknown>)({auth:{uid:'admin'},data:{limit:20,after:'last'}});
  expect(db.runTransaction).toHaveBeenCalledWith(expect.any(Function),{readOnly:true});
  expect(query.where).toHaveBeenCalledWith('state','==','submitted');
  expect(query.orderBy.mock.calls[0][0].toString()).toBe('__name__');
  expect(query.limit).toHaveBeenCalledWith(21); expect(query.startAfter).toHaveBeenCalledWith('last');
  expect(get.mock.calls.map(call=>call[0])).toEqual([identityRef,query]);
});
