import type {VerificationRequest} from './verification';
export type VerificationQueueItem = Pick<VerificationRequest,
  'requestId' | 'doctorUid' | 'profileRevision' | 'professional' | 'credentials' | 'submittedAt'>;
/** Document-ID ordering, not chronological ordering. Cursor remains valid after review. */
export interface VerificationQueueInput { limit?: number; after?: string }
export interface VerificationQueuePage { items: VerificationQueueItem[]; nextCursor: string | null }
