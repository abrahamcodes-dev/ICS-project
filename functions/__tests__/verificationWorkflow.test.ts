import { fixture, identity, credential, professional, now } from './helpers/verificationFixture';
import { fail } from '../src/profiles/domainValidation';
import { planDoctorDraft } from '../src/profiles/verificationPolicy';

test.each(['submit', 'review'] as const)('%s requires authentication', async method => {
  await expect(fixture().handlers[method]({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
});
test.each(['patient', 'administrator', 'admin', 'unknown'])('%s cannot submit', async role => {
  const f = fixture(); f.docs['users/doctor'] = identity('doctor', role);
  await expect(f.submit()).rejects.toMatchObject({ code: 'permission-denied' }); expect(f.requests()).toHaveLength(0);
});
test.each([null, {}, identity('wrong'), identity('doctor', 'doctor', { status: 'disabled' }),
  identity('doctor', 'doctor', { verificationStatus: 'invalid' })])('invalid doctor %# cannot submit', async user => {
  const f = fixture(); f.docs['users/doctor'] = user; await expect(f.submit()).rejects.toMatchObject({ code: 'permission-denied' });
});
test('approved doctor cannot submit', async () => {
  const f = fixture(); f.docs['users/doctor'].verificationStatus = 'approved';
  await expect(f.submit()).rejects.toMatchObject({ code: 'failed-precondition' });
});
test.each(['professionalName', 'specialty', 'registrationNumber', 'issuingAuthority'])('missing %s prevents submission', async key => {
  const f = fixture(); delete f.docs['doctorProfiles/doctor'][key]; await expect(f.submit()).rejects.toMatchObject({ code: 'failed-precondition' });
});
test.each([{ expectedRevision: 2 }, { credentialIds: [] }, { credentialIds: ['license', 'license'] }, { credentialIds: Array(6).fill('license') },
  { credentialIds: ['../bad'] }, { expectedRevision: 0 }])('invalid/stale submission %#', async input => {
  const f = fixture(); await expect(f.submit(input)).rejects.toBeDefined(); expect(f.requests()).toHaveLength(0);
});
test.each(['doctorUid', 'professional', 'requestId', 'state', 'previousRequestId', 'submittedAt', 'generation', 'checksum', 'verificationStatus', 'reviewerUid'])
  ('submission rejects authoritative %s', async key => { await expect(fixture().submit({ [key]: 'spoof' })).rejects.toMatchObject({ code: 'invalid-argument' }); });
test.each([{ doctorUid: 'other' }, { state: 'prepared', generation: null, checksum: null }, { state: 'attached', requestId: 'elsewhere' },
  { category: 'identity_document' }, { generation: null }, { checksum: 'bad' }, { storagePath: 'wrong' }])('invalid credential %# prevents attachment', async extra => {
  const f = fixture(); Object.assign(f.docs['doctorCredentials/license'], extra);
  await expect(f.submit()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(f.requests()).toHaveLength(0);
});
test('five credentials are valid and snapshot omits private phone', async () => {
  const f = fixture(); const ids = ['license', 'two', 'three', 'four', 'five'];
  ids.slice(1).forEach(id => { f.docs['doctorCredentials/' + id] = credential(id, { category: 'professional_certificate' }); });
  const result = await f.submit({ credentialIds: ids }); const request = f.requests()[0];
  expect(result).toEqual({ requestId: 'request-1', state: 'submitted', profileRevision: 1 });
  expect(request.professional).toEqual(professional); expect(request.credentials).toHaveLength(5);
  expect(request.reviewerUid).toBeNull(); expect(request.professional).not.toHaveProperty('phoneNumber');
  expect(f.docs['doctorProfiles/doctor']).toMatchObject({ activeRequestId: result.requestId, revision: 1 });
  ids.forEach(id => expect(f.docs['doctorCredentials/' + id]).toMatchObject({ state: 'attached', requestId: result.requestId }));
  expect(f.audits()).toHaveLength(1);
});
test('matching concurrent submissions and lost-response retries return one request', async () => {
  const f = fixture(); const [one, two] = await Promise.all([f.submit(), f.submit()]);
  expect(one).toEqual(two); expect(await f.submit()).toEqual(one); expect(f.requests()).toHaveLength(1); expect(f.audits()).toHaveLength(1);
});
test('active request forbids different evidence selection', async () => {
  const f = fixture(); await f.submit(); f.docs['doctorCredentials/new'] = credential('new');
  await expect(f.submit({ credentialIds: ['new'] })).rejects.toMatchObject({ code: 'failed-precondition' }); expect(f.requests()).toHaveLength(1);
});
test.each(['missing', 'checksum', 'generation'])('%s evidence fails submission without partial state', async kind => {
  const f = fixture(); f.inspect.mockImplementation(async path => {
    if (kind === 'missing') return fail('missing-object');
    const data = f.docs['doctorCredentials/license'];
    return { ...data, generation: kind === 'generation' ? '999' : data.generation, checksum: kind === 'checksum' ? 'b'.repeat(64) : data.checksum };
  });
  await expect(f.submit()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(f.requests()).toHaveLength(0);
  expect(f.docs['doctorCredentials/license'].state).toBe('ready');
});
test('authorization and draft revision are rechecked after inspection', async () => {
  for (const change of ['disabled', 'revision', 'attached']) {
    const f = fixture(); f.assertUnchanged.mockImplementation(async () => {});
    f.inspect.mockImplementation(async () => {
      const data = f.docs['doctorCredentials/license']; const result = { generation: data.generation, checksum: data.checksum, contentType: data.contentType, sizeBytes: data.sizeBytes };
      if (change === 'disabled') f.docs['users/doctor'].status = 'disabled';
      if (change === 'revision') f.docs['doctorProfiles/doctor'].revision = 2;
      if (change === 'attached') Object.assign(data, { state: 'attached', requestId: 'other' });
      return result;
    });
    await expect(f.submit()).rejects.toBeDefined(); expect(f.requests()).toHaveLength(0);
  }
});
test.each(['patient', 'doctor', 'admin', 'unknown'])('%s cannot review', async role => {
  const f = fixture(); await f.submit(); f.docs['users/admin'] = identity('admin', role);
  await expect(f.review()).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each([null, {}, identity('wrong', 'administrator'), identity('admin', 'administrator', { status: 'disabled' }),
  identity('admin', 'administrator', { schemaVersion: 2 })])('invalid administrator %# denied', async user => {
  const f = fixture(); await f.submit(); f.docs['users/admin'] = user; await expect(f.review()).rejects.toMatchObject({ code: 'permission-denied' });
});
test('self-review is rejected even after role changes', async () => {
  const f = fixture(); await f.submit(); f.docs['users/doctor'] = identity('doctor', 'administrator');
  await expect(f.review({}, 'doctor')).rejects.toMatchObject({ code: 'failed-precondition' });
});
test.each(['doctorUid', 'reviewerUid', 'updatedAt', 'publicProfile', 'verificationStatus', 'audit'])('review rejects trusted %s', async key => {
  await expect(fixture().review({ [key]: 'spoof' })).rejects.toMatchObject({ code: 'invalid-argument' });
});
test.each([{ decision: 'approved', rejectionReason: 'no' }, { decision: 'rejected' }, { decision: 'rejected', rejectionReason: '' },
  { decision: 'rejected', rejectionReason: 'x'.repeat(1001) }, { decision: 'rejected', rejectionReason: 'bad\nreason' }])('invalid review decision %#', async data => {
  await expect(fixture().review(data)).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('approval publishes exact immutable projection and trusted reviewer/audit', async () => {
  const f = fixture(); await f.submit(); const before = structuredClone(f.requests()[0]); await f.review();
  const publicProfile = f.docs['doctorPublicProfiles/doctor'];
  expect(Object.keys(publicProfile).sort()).toEqual(['uid', 'professionalName', 'specialty', 'approvedRevision', 'approvedRequestId', 'schemaVersion', 'publishedAt', 'updatedAt'].sort());
  expect(publicProfile).toMatchObject({ professionalName: before.professional.professionalName, specialty: before.professional.specialty, approvedRevision: 1 });
  expect(f.docs['users/doctor']).toMatchObject({ verificationStatus: 'approved', updatedAt: new Date(now.seconds * 1000).toISOString() });
  expect(f.docs['doctorProfiles/doctor']).toMatchObject({ activeRequestId: null, approvedRequestId: 'request-1', revision: 1 });
  expect(f.requests()[0]).toMatchObject({ state: 'approved', reviewerUid: 'admin', reviewedAt: now, professional: before.professional, credentials: before.credentials });
  expect(f.audits()).toHaveLength(2);
});
test('rejection preserves evidence/history, omits projection and accepts maximum normalized reason', async () => {
  const f = fixture(); await f.submit(); await f.review({ decision: 'rejected', rejectionReason: ' ' + 'r'.repeat(1000) + ' ' });
  expect(f.docs['users/doctor'].verificationStatus).toBe('rejected'); expect(f.requests()[0].rejectionReason).toHaveLength(1000);
  expect(f.docs['doctorProfiles/doctor']).toMatchObject({ activeRequestId: null, approvedRequestId: null, revision: 1 });
  expect(f.docs).not.toHaveProperty('doctorPublicProfiles/doctor'); expect(f.docs['doctorCredentials/license'].state).toBe('attached');
});
test('rejection remains possible with missing binary or credential metadata', async () => {
  const f = fixture(); await f.submit(); delete f.docs['doctorCredentials/license']; f.inspect.mockImplementation(async () => fail('missing'));
  await expect(f.review({ decision: 'rejected', rejectionReason: 'Evidence unavailable' })).resolves.toMatchObject({ state: 'rejected' });
});
test.each(['missing-request', 'stale-revision', 'active-reference', 'profile-revision', 'snapshot', 'doctor', 'credential-owner', 'credential-state', 'credential-reference', 'credential-category', 'credential-checksum'])
  ('inconsistent %s prevents approval', async kind => {
    const f = fixture(); await f.submit();
    if (kind === 'missing-request') delete f.docs['verificationRequests/request-1'];
    if (kind === 'active-reference') f.docs['doctorProfiles/doctor'].activeRequestId = 'other';
    if (kind === 'profile-revision') f.docs['doctorProfiles/doctor'].revision = 2;
    if (kind === 'snapshot') f.docs['doctorProfiles/doctor'].professionalName = 'Mutated';
    if (kind === 'doctor') f.docs['users/doctor'] = {};
    if (kind === 'credential-owner') f.docs['doctorCredentials/license'].doctorUid = 'other';
    if (kind === 'credential-state') f.docs['doctorCredentials/license'].state = 'ready';
    if (kind === 'credential-reference') f.docs['doctorCredentials/license'].requestId = 'wrong';
    if (kind === 'credential-category') f.docs['doctorCredentials/license'].category = 'identity_document';
    if (kind === 'credential-checksum') f.docs['doctorCredentials/license'].checksum = 'b'.repeat(64);
    await expect(f.review(kind === 'stale-revision' ? { expectedRevision: 2 } : {})).rejects.toBeDefined();
    expect(f.docs['users/doctor']?.verificationStatus).not.toBe('approved'); expect(f.audits()).toHaveLength(1);
  });
test('missing/changed binary blocks approval', async () => {
  const f = fixture(); await f.submit(); f.inspect.mockImplementation(async () => fail('missing-object'));
  await expect(f.review()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(f.requests()[0].state).toBe('submitted');
});
test.each(['approved', 'rejected'])('same %s review retries and concurrent calls create one decision event', async decision => {
  const f = fixture(); await f.submit(); const input = decision === 'rejected' ? { decision, rejectionReason: 'Unreadable' } : { decision };
  const results = await Promise.all([f.review(input), f.review(input)]); expect(results[0]).toEqual(results[1]);
  expect(await f.review(input)).toEqual(results[0]); expect(f.audits()).toHaveLength(2);
  await expect(f.review({ decision: decision === 'approved' ? 'rejected' : 'approved', ...(decision === 'approved' ? { rejectionReason: 'Changed' } : {}) })).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('two administrators cannot overwrite each other or duplicate audit', async () => {
  const f = fixture(); await f.submit(); f.docs['users/second'] = identity('second', 'administrator');
  const results = await Promise.allSettled([f.review(), f.review({}, 'second')]);
  expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1); expect(f.audits()).toHaveLength(2);
});
test('rejected resubmission requires a newer draft and fresh evidence and links history', async () => {
  const f = fixture(); await f.submit(); await f.review({ decision: 'rejected', rejectionReason: 'Unreadable' });
  f.docs['doctorCredentials/new'] = credential('new');
  await expect(f.submit({ credentialIds: ['new'] })).rejects.toMatchObject({ code: 'failed-precondition' });
  f.docs['doctorProfiles/doctor'] = planDoctorDraft('doctor', f.docs['doctorProfiles/doctor'], professional, 1, 'rejected', now);
  await expect(f.submit({ expectedRevision: 2 })).rejects.toMatchObject({ code: 'failed-precondition' });
  const result = await f.submit({ expectedRevision: 2, credentialIds: ['new'] });
  expect(f.docs['verificationRequests/' + result.requestId]).toMatchObject({ previousRequestId: 'request-1', profileRevision: 2, state: 'submitted' });
  expect(f.docs['verificationRequests/request-1'].state).toBe('rejected'); expect(f.docs['users/doctor'].verificationStatus).toBe('pending');
});
test.each(['submit', 'review'])('%s commit failure rolls back all writes', async action => {
  const f = fixture(); if (action === 'review') await f.submit(); const before = structuredClone(f.docs); f.control.failCommit = true;
  await expect(action === 'submit' ? f.submit() : f.review()).rejects.toMatchObject({ code: 'internal' }); expect(f.docs).toEqual(before);
});
