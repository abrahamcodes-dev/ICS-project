import { readFileSync } from 'fs';
import { resolve } from 'path';

test('only supported appointment, verification and payment composites are configured', () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../firestore.indexes.json'), 'utf8'));
  const index = (collectionGroup: string, fields: [string, string][]) => ({ collectionGroup, queryScope: 'COLLECTION',
    fields: fields.map(([fieldPath, order]) => ({ fieldPath, order })) });
  const expected = ['patientId', 'doctorId'].flatMap(owner => [
    index('appointments', [[owner, 'ASCENDING'], ['status', 'ASCENDING'], ['startAt', 'ASCENDING']]),
    index('appointments', [[owner, 'ASCENDING'], ['startAt', 'DESCENDING']]),
  ]);
  expected.push(index('verificationRequests', [['doctorUid', 'ASCENDING'], ['profileRevision', 'DESCENDING']]));
  for (const owner of ['patientId', 'doctorId']) expected.push(
    index('consultationPayments', [[owner, 'ASCENDING'], ['createdAt', 'DESCENDING'], ['__name__', 'DESCENDING']]),
    index('consultationPayments', [[owner, 'ASCENDING'], ['status', 'ASCENDING']]),
  );
  expected.push(index('consultationPayments', [['doctorId', 'ASCENDING'], ['status', 'ASCENDING'], ['amountMinor', 'ASCENDING']]));
  expect(config.indexes).toHaveLength(expected.length);
  expect(config.indexes).toEqual(expect.arrayContaining(expected));
  expect(config.fieldOverrides).toEqual([]);
});
