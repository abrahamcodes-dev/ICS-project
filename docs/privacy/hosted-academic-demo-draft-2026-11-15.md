# Hosted synthetic-data testing policy — owner approval draft

Hosted notice version: academic-demo-2026-11-15-v1. The owner approved restricted
academic testing and retention/deletion disclosures. The notice is implemented in
the hosted registration UI and enforced by the server; nothing is deployed.
Local emulator documents and consent behavior remain unchanged. Named contacts,
assessment/expiry/disposal dates and provider-log retention remain owner inputs.

## Notice and agreement

This is a restricted academic demonstration, not a healthcare service. Use only
assigned synthetic patients, fictitious doctor profiles and clearly labelled sample
documents. Do not enter actual symptoms, patient information, professional identity
documents, personal payment details or other people's information. Payments and
refunds are simulated and move no money. No emergency or clinical service is offered.

The demo processes test account identifiers, role/approval state, synthetic
appointments, messages, documents, prescriptions, simulated financial events and
consent/audit records. Signalling may contain network/device metadata. Use dedicated
test Google accounts if that provider is approved; identifiers and IP addresses
can still be personal information. The owner must approve the project location,
controller/contact, tester notice and access list before collection begins.

Agreement to participate must be explicit and versioned. Optional medical-record
sharing remains disabled, regardless of Allow/Decline/Withdraw. Participation is
not blanket consent for real records, research reuse or public disclosure. Keep
existing authorized, appointment-bound access restrictions for synthetic documents.

## Proposed retention and account deletion

The proposed hosted disposal deadline is 30 days after final assessment. Record
finalAssessmentAt and disposalDeadlineAt in the owner-controlled configuration,
and configure each invitation/membership expiresAt independently. Neither a fixed
calendar date nor automatic purging is inferred from this proposal. Inventory and
dispose of hosted application records and recovery copies under the approved plan.
Record actual dates, responsible operator and evidence of completion. Platform logs
and provider-required audit retention must be separately inventoried; do not promise
that these limits automatically erase provider-managed logs.

An account-deletion request disables canonical access, revokes sessions, performs
eligible profile/device/upload cleanup and removes the Auth account. Shared clinical
records, health history, professional-verification evidence, ratings, consent/audits,
operational records and simulated financial transactions can remain. Verification
evidence may move to private, token-free archival storage. UID tombstones and
provenance remain pseudonymous, not anonymous. The job reports retention_pending;
technical completion is not complete legal erasure.

Hosted disposal is a separate owner-authorized operation: stop new tests and
checkout creation; resolve simulated pending payments/refunds and deletion work;
verify recovery copies; pause scheduled jobs when safe; enumerate Firestore,
Storage/archives, Auth, logs and copies; then execute an approved disposal plan and
record verification. No automatic all-category purge or TTL policy is implemented
by this draft. Do not silently destroy retained shared records or verification evidence.
Code rollback cannot undo Auth deletion or restore mutated data.

Existing local emulator accounts, records, snapshots and backups are outside this
hosted disposal proposal and must remain untouched. No real-patient approval or
legal/clinical compliance is claimed. FCM, STUN/TURN, physical audio and complete
manual consultation/payment acceptance remain Phase 4 work.
