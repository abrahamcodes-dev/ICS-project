# Checkpoint 9D: consultation chat

Patients use Appointments → Open consultation; doctors use Consultations → Open
consultation. Existing appointment eligibility checks and typed appointment IDs
are unchanged. The shared consultation gate calls `openConsultation`, verifies
the returned participant binding and active room, then shows text chat alongside
the existing audio/video controls. No separate directory or administrator access
to conversations is introduced.

Messages use the existing session adapter: bounded newest-page subscription (30),
deduplication by message ID, and older pages with the original Firestore Timestamp
and document-ID cursor. The UI reverses the adapter's descending order for
chronological display. Sender labels are You/Doctor/Patient, derived from the
authorized room; no profile lookup or invented participant names are used.

Text goes only through `sendConsultationMessage`. New sends retain the backend's
active-account, approval, appointment-window, closure and rate checks. A failed
acknowledgment retains an immutable request UUID and text; Retry same message
reuses both. No optimistic message is labeled delivered. An acknowledged send
clears the composer; Firestore provides the displayed history. Failed requests
are conservatively treated as unconfirmed, including explicit server rejections.
The backend may continue rejecting retries when eligibility has ended.

Identity refresh clears text/history, stops listeners and ignores pending results.
Leaving or blurring the consultation unmounts its resources. Retry keys are
in-memory only: leaving, restarting the call room, or restarting the application
discards them. Check history before manually recomposing an unconfirmed message.
History may contain cached data while offline; no delivery/read receipt or online
presence is claimed. Long histories load explicitly rather than automatically.

Rules and backend contracts are unchanged. Direct message writes and private
sender-state reads remain denied. Historical read permission exists in the
backend, but this UI intentionally retains the existing active-appointment entry
gate; it does not add a closed-consultation archive.

## Verification and demonstration

Focused tests cover chronological labels/cursors, acknowledgment and exact retry,
duplicate taps, identity cleanup, late callbacks, teardown and read retry. Run
mobile typecheck plus consultationChat, consultationService, callUI,
schedulingAppointments and appointmentsScreen Jest suites.

Automated result: mobile TypeScript passed; 44 tests passed across those five
suites. The initial run needed a missing auth-service mock in the call UI suite
and had one cold-run timeout; both affected suites passed on retry (18/18).
The other three suites passed initially (26/26). Git whitespace checks passed.

Device verification remains pending. Use an authorized local emulator backend
with both canonical participants, an approved doctor and a currently eligible
appointment. Enter the same appointment from patient and doctor accounts; exchange
text, load older history, interrupt/reconnect networking and retry an unconfirmed
send. Confirm one stored message, then test logout/navigation cleanup and unchanged
call controls. Backend callables and Rules must be available in that environment;
this checkpoint neither deploys them nor demonstrates a live two-device call.
