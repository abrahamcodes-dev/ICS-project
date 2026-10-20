# Checkpoint 9F — consultation ratings

## Workflow

Patient → Appointments → Appointment history → Rate or view my rating, on an
owned appointment returned as `completed`. Select an integer 0–5 (zero is an
explicit selection), optionally enter up to 1000 characters, review and confirm.
The confirmed record replaces the form. An existing rating is read-only.
Elapsed time, call termination and consultation closure alone never confer eligibility.
The backend also requires an existing consultation bound to that completed
appointment. Missing consultation records fail closed.

Doctor → Profile → Consultation ratings shows the doctor's own average and total
rating count, with explicit refresh. An empty aggregate displays no ratings, not
a fabricated score. No public directory ratings, patient identities or individual
comments are exposed to doctors or other users.

## Backend and privacy

Three source exports (26 total; not deployed):

- `rateDoctor({consultationId, score, comment?})`
- `getOwnConsultationRating({consultationId})`
- `getOwnDoctorRatingSummary({})`

Canonical active patient identity and appointment ownership are required for
rating creation and retrieval. Custom claims confer no access. Doctor identity
comes from the authoritative appointment. Consultation and appointment bindings
are validated using existing consultation history policy. Doctor approval loss
does not remove an eligible patient's right to rate a completed appointment.
Summary access requires the canonical active doctor and derives its target UID
from authentication. Administrators have no special rating access.

`ratings/{consultationId}` is immutable, storing consultationId, appointmentId,
patientId, doctorId, score, normalized comment, server Firestore createdAt Timestamp
and schemaVersion 1. Callable patient responses omit both participant IDs.
`doctorRatingSummaries/{doctorId}` holds doctorId, integer count, integer sum and
schemaVersion 1. Rating creation and aggregate update share one transaction with
all reads before writes. No unbounded scans or new query indexes are needed.

One rating per consultation: identical normalized payloads replay the original
without another aggregate increment; different content conflicts. No edit/delete
endpoint exists. This works after a lost response or application restart without
requiring a separately persisted request UUID. Aggregate updates serialize
concurrent submissions on the same doctor's document.

Both collections remain denied to all direct client reads/writes by the unchanged
Firestore catch-all. Access is through independently authorized Admin SDK callables.
No rules, identity documents or lifecycle transitions are changed.

Comments are sensitive, patient-private feedback, not public reviews. The UI asks
patients not to include clinical or identifying information, but does not claim
automatic redaction. No rating/comment content is logged. Low-count aggregates
can still permit inference; this checkpoint provides no anonymity guarantee.

## Retry, cleanup and limitations

Pending submissions disable duplicate taps and lock the score/comment. Retry
uses the same payload; refresh can recover an existing record. No optimistic
success is displayed. Screen blur/unmount and identity changes dispose sessions;
late callable responses are ignored, with private state cleared on identity refresh.
The draft is memory-only. Previously saved records remain retrievable.

No moderation, public reviews, rating edits, deletion or notification workflow is
implemented. Existing historical ratings from the inactive legacy scaffold are
not scanned or migrated. Deployment requires a separate review if such data exists.

## Validation

Focused tests cover canonical authorization, completed status, cross-user denial,
zero/invalid scores, comment bounds, immutable retries, aggregate privacy, rollback,
storage timestamps, navigation eligibility, confirmation, duplicate taps and cleanup.
Mock transaction serialization is not real emulator concurrency evidence.

Automated results: Node 22 Functions build passed; backend authorization/export
tests 23/23 and persistence tests 4/4 passed. Mobile TypeScript passed and 44/44
focused mobile tests passed across five suites. One cold-run UI test timed out;
the unchanged UI suite passed 5/5 on its isolated retry. Whitespace checks passed.

Android workflow, real Firebase transaction contention and Rules execution remain
pending. No emulator is launched for this checkpoint. Existing identity Rules tests
include denial of direct `ratings` access; rules remain unchanged.

For device testing, use synthetic completed appointment/consultation records in the
authorized local environment. Submit 0 and 5 on separate consultations, reconnect
after a lost response, verify one record/count increment, attempt another patient's
consultation, check logout cleanup, and refresh the doctor's aggregate. Source
exports alone do not make these callables available on a running backend.
