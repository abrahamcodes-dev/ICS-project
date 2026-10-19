import {onCall} from 'firebase-functions/v2/https';
import {FieldPath} from 'firebase-admin/firestore';
import {db} from '../shared/firestoreRefs';
import {createVerificationQueue} from './verificationQueue';
import type {VerificationRequest} from '../../../shared/types/verification';

const queue = createVerificationQueue(work => db.runTransaction(async tx => work({
  identity: async uid => (await tx.get(db.collection('users').doc(uid))).data(),
  list: async (limit, after) => {
    // Equality plus ascending document ID uses the existing automatic state index.
    let query = db.collection('verificationRequests').where('state', '==', 'submitted')
      .orderBy(FieldPath.documentId()).limit(limit);
    if (after) query = query.startAfter(after);
    return (await tx.get(query)).docs.map(doc => ({id: doc.id, data: doc.data() as VerificationRequest}));
  },
}), {readOnly: true}));
export const listPendingDoctorVerifications = onCall(request => queue(request));
