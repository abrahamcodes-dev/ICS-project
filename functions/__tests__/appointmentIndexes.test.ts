import { readFileSync } from 'fs';
import { resolve } from 'path';

test('only the four supported appointment composites are added; verification index is preserved', () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../firestore.indexes.json'), 'utf8'));
  const index = (collectionGroup: string, fields: [string, string][]) => ({ collectionGroup, queryScope: 'COLLECTION',
    fields: fields.map(([fieldPath, order]) => ({ fieldPath, order })) });
  const expected = ['patientId', 'doctorId'].flatMap(owner => [
    index('appointments', [[owner, 'ASCENDING'], ['status', 'ASCENDING'], ['startAt', 'ASCENDING']]),
    index('appointments', [[owner, 'ASCENDING'], ['startAt', 'DESCENDING']]),
  ]);
  expected.push(index('verificationRequests', [['doctorUid', 'ASCENDING'], ['profileRevision', 'DESCENDING']]));
  expect(config.indexes).toHaveLength(expected.length);
  expect(config.indexes).toEqual(expect.arrayContaining(expected));
  expect(config.fieldOverrides).toEqual([]);
});
