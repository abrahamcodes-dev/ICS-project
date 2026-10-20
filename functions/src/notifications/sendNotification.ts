/** Remote push is intentionally disabled until native FCM credentials and delivery infrastructure are approved.
 * Notification events are persisted atomically in private inboxes by the source transaction writers.
 * Never pass message text, prescriptions or medical details to a push transport.
 */
export const REMOTE_PUSH_ENABLED = false;
