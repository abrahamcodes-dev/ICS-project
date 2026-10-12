const mockCallable = jest.fn();
const mockGetDocs = jest.fn();
const mockOnSnapshot = jest.fn();
const mockQuery = jest.fn((...args) => ({ args }));
const mockCollection = jest.fn((...args) => ({ path: args.slice(1).join('/') }));
const mockOrderBy = jest.fn((field, direction) => ({ kind: 'orderBy', field, direction }));
const mockLimit = jest.fn(value => ({ kind: 'limit', value }));
const mockStartAfter = jest.fn((...values) => ({ kind: 'startAfter', values }));
const mockDocumentId = jest.fn(() => '__name__');
const mockIdentityListeners = new Set();
// Preserve seconds/nanoseconds in the SDK test double, including fractional ms.
class mockTimestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1000000; }
  static fromMillis(ms) {
    const seconds = Math.floor(ms / 1000);
    return new mockTimestamp(seconds, (ms - seconds * 1000) * 1000000);
  }
}
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn(() => mockCallable) }));
jest.mock('firebase/firestore', () => ({
  Timestamp: mockTimestamp, collection: mockCollection, documentId: mockDocumentId, getDocs: mockGetDocs, limit: mockLimit, onSnapshot: mockOnSnapshot, orderBy: mockOrderBy, query: mockQuery, startAfter: mockStartAfter,
}));
jest.mock('../src/services/firebaseConfig', () => ({ app: {}, db: {} }));
jest.mock('../src/services/authService', () => ({ onIdentityRefresh: jest.fn(listener => {
  mockIdentityListeners.add(listener); return () => mockIdentityListeners.delete(listener);
}) }));

const service = require('../src/services/consultationService');
const { httpsCallable } = require('firebase/functions');
const room = 'a'.repeat(64);
function snap(id, ms, text = 'Synthetic') {
  return { id, data: () => ({ messageId: id, senderId: 'patient', type: 'text', text, createdAt: ms instanceof mockTimestamp ? ms : mockTimestamp.fromMillis(ms), schemaVersion: 1 }) };
}
beforeEach(() => { jest.clearAllMocks(); mockCallable.mockReset(); mockGetDocs.mockReset(); mockOnSnapshot.mockReset(); mockIdentityListeners.clear(); });

test('open and send use trusted callables; request UUID is passed through unchanged', async () => {
  mockCallable.mockResolvedValueOnce({ data: { consultationId: room } });
  await service.openConsultation(room);
  expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'openConsultation');
  expect(mockCallable).toHaveBeenCalledWith({ appointmentId: room });
  const input = { consultationId: room, messageRequestId: '12345678-1234-4234-8234-123456789abc', text: 'Hello' };
  mockCallable.mockResolvedValueOnce({ data: { messageId: 'b'.repeat(64) } });
  await service.sendConsultationMessage(input);
  expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'sendConsultationMessage');
  expect(mockCallable).toHaveBeenCalledWith(input);
});

test('latest subscription uses createdAt/doc ID descending and default limit 30', () => {
  mockOnSnapshot.mockReturnValue(jest.fn());
  service.subscribeToLatestMessages(room, jest.fn(), jest.fn());
  expect(mockOrderBy).toHaveBeenNthCalledWith(1, 'createdAt', 'desc');
  expect(mockOrderBy).toHaveBeenNthCalledWith(2, '__name__', 'desc');
  expect(mockLimit).toHaveBeenCalledWith(30);
});

test('older page uses timestamp plus message ID cursor and deduplicates document IDs', async () => {
  mockGetDocs.mockResolvedValue({ docs: [snap('m2', 2000), snap('m2', 2000), snap('m1', 1000)] });
  const page = await service.loadOlderMessages(room, { createdAt: mockTimestamp.fromMillis(3000), messageId: 'm3' }, 20);
  expect(mockStartAfter).toHaveBeenCalledWith(mockTimestamp.fromMillis(3000), 'm3');
  expect(mockLimit).toHaveBeenCalledWith(20);
  expect(page.messages.map(m => m.messageId)).toEqual(['m2', 'm1']);
  expect(page.nextCursor).toEqual({ createdAt: mockTimestamp.fromMillis(1000), messageId: 'm1' });
});

test.each([0, 51, 1.5])('rejects invalid page size %s before reading Firestore', async size => {
  await expect(service.loadOlderMessages(room, { createdAt: mockTimestamp.fromMillis(1), messageId: 'm' }, size)).rejects.toThrow(/page size/i);
  expect(mockGetDocs).not.toHaveBeenCalled();
});

test('invalid message payload fails closed instead of entering UI state', () => {
  let callback; mockOnSnapshot.mockImplementation((_q, next) => { callback = next; return jest.fn(); });
  const onPage = jest.fn(); service.subscribeToLatestMessages(room, onPage, jest.fn());
  expect(() => callback({ docs: [{ id:'m', data:() => ({ messageId:'wrong' }) }] })).toThrow(/invalid consultation message/i);
  expect(onPage).not.toHaveBeenCalled();
});

function sessionFixture() {
  const callbacks = [], stops = [], observed = [];
  mockOnSnapshot.mockImplementation((_q, next, error) => {
    callbacks.push({ next, error }); const stop = jest.fn(); stops.push(stop); return stop;
  });
  const session = service.createConsultationMessageSession();
  const notify = messages => observed.push(messages.map(m => m.messageId));
  const stop = session.start(room, notify, jest.fn());
  callbacks[0].next({ docs: [snap('m2', 2000), snap('m1', 1000)] });
  return { session, callbacks, stops, observed, notify, stop };
}
const cursor = () => ({ createdAt: mockTimestamp.fromMillis(1000), messageId: 'm1' });

test.each(['clear', 'logout', 'dispose'])('%s immediately empties visible state and ignores a late page/listener', async action => {
  const f = sessionFixture(); let resolve;
  mockGetDocs.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const pending = f.session.loadOlder(cursor());
  if (action === 'logout') [...mockIdentityListeners][0](); else f.session[action]();
  expect(f.observed.at(-1)).toEqual([]); expect(f.stops[0]).toHaveBeenCalledTimes(1);
  const notifications = f.observed.length;
  resolve({ docs: [snap('old', 500)] });
  expect(await pending).toBeNull();
  f.callbacks[0].next({ docs: [snap('stale', 3000)] });
  expect(f.observed).toHaveLength(notifications);
  expect(await f.session.loadOlder(cursor())).toBeNull();
  if (action === 'dispose') {
    expect(() => f.session.start(room, f.notify, jest.fn())).toThrow(/disposed/);
    expect(mockIdentityListeners.size).toBe(0);
  } else {
    f.session.start(room, f.notify, jest.fn());
    f.callbacks[1].next({ docs: [snap('new', 3000)] });
    mockGetDocs.mockResolvedValueOnce({ docs: [snap('older', 2000)] });
    expect(await f.session.loadOlder(cursor())).not.toBeNull();
    expect(f.observed.at(-1)).toEqual(['new', 'older']);
  }
  f.session.dispose();
});

test('room switch ignores previous page, callback and cleanup without clearing the new room', async () => {
  const f = sessionFixture(); let resolve;
  mockGetDocs.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const pending = f.session.loadOlder(cursor());
  f.session.start('b'.repeat(64), f.notify, jest.fn());
  f.callbacks[1].next({ docs: [snap('new-room', 4000)] });
  f.stop();
  f.callbacks[0].next({ docs: [snap('old-room', 5000)] });
  resolve({ docs: [snap('old-page', 500)] });
  expect(await pending).toBeNull();
  expect(f.observed.at(-1)).toEqual(['new-room']);
  expect(f.stops[1]).not.toHaveBeenCalled();
  f.session.dispose();
});

test('stale pagination errors are ignored; current errors remain observable', async () => {
  const f = sessionFixture(); let reject;
  mockGetDocs.mockReturnValueOnce(new Promise((_r, r) => { reject = r; }));
  const pending = f.session.loadOlder(cursor()); f.session.clear(); reject(new Error('Synthetic network failure'));
  expect(await pending).toBeNull();
  f.session.start(room, f.notify, jest.fn());
  mockGetDocs.mockRejectedValueOnce(new Error('Current network failure'));
  await expect(f.session.loadOlder(cursor())).rejects.toThrow('Current network failure');
  f.session.dispose();
});

test('exact nanosecond cursor round-trip and deduplicated session ordering do not use rounded milliseconds', async () => {
  const f = sessionFixture();
  const earlier = new mockTimestamp(1800000000, 123456000), later = new mockTimestamp(1800000000, 123456001);
  // JavaScript numbers cannot distinguish these two epoch-millisecond values.
  expect(earlier.toMillis()).toBe(later.toMillis());
  f.callbacks[0].next({ docs: [snap('a', later), snap('z', earlier)] });
  mockGetDocs.mockResolvedValueOnce({ docs: [snap('z', earlier), snap('b', earlier)] });
  const page = await f.session.loadOlder({ createdAt: earlier, messageId: 'z' });
  expect(mockStartAfter).toHaveBeenLastCalledWith(earlier, 'z');
  expect(mockStartAfter.mock.calls.at(-1)[0]).toBe(earlier);
  expect(page.nextCursor.createdAt).toBe(earlier);
  expect(page.nextCursor.createdAt.nanoseconds).toBe(123456000);
  expect(f.observed.at(-1)).toEqual(['a', 'z', 'b', 'm2', 'm1']);
  f.session.dispose();
});

test.each([new mockTimestamp(-62135596800, 1), new mockTimestamp(253402300799, 999999999)])('accepts Timestamp range endpoint %# without rounding', async time => {
  mockGetDocs.mockResolvedValueOnce({ docs: [snap('m', time)] });
  const page = await service.loadOlderMessages(room, { createdAt: time, messageId: 'n' });
  expect(page.nextCursor.createdAt).toBe(time);
  expect(mockStartAfter).toHaveBeenLastCalledWith(time, 'n');
});

test('rejects numeric or structural timestamp cursors before querying', async () => {
  for (const createdAt of [1000, { seconds: 1, nanoseconds: 0 }]) {
    await expect(service.loadOlderMessages(room, { createdAt, messageId: 'm' })).rejects.toThrow(/cursor/);
  }
  expect(mockGetDocs).not.toHaveBeenCalled();
});
