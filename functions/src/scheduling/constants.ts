const minute = 60 * 1000;
export const SCHEDULING = Object.freeze({
  appointmentDurationMs: 30 * minute,
  slotIntervalMs: 30 * minute,
  bookingLeadMs: 5 * minute,
  horizonDays: 90,
  maxWindowsPerUtcDay: 8,
  maxDiscoveryDays: 7,
  cancellationReasonMax: 500,
  schemaVersion: 1 as const,
  utcDayMs: 24 * 60 * minute,
});
// Firestore Timestamp range, matching the C3 domain timestamp validator.
export const MIN_TIMESTAMP_MS = -62135596800000;
export const MAX_TIMESTAMP_MS = 253402300799999;
