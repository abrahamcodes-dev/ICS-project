export interface AccountDeletionView {
 state:'requested'|'processing'|'retryable'|'completed';
 phase:string;
 legalErasure:'retention_pending';
 retainedCategories:string[];
 requestedAt:string;
 updatedAt:string;
 requestReference:string;
}
