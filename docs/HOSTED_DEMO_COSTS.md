# Academic-demo cost exposure and spending response

Planning estimates checked against official pricing on 15 November 2026; not a
quote or guarantee. Assume us-central1, request-based Functions billing, no paid
networking/TURN/FCM expansion, dedicated test accounts, no SMS and no other project
consuming shared billing-account free allowances. Owner must confirm actual SKUs,
regions, free-tier eligibility and tax/currency in Console before deployment.

## Idle and small-scale scenarios

| Component | Estimated usage / exposure |
| --- | --- |
| Scheduled work, no testers, 30 days | Payment reconciliation every minute: 43,200; deletion every 5 minutes: 8,640; attachment cleanup hourly: 720. Total 52,560 invocations. Minimum empty-query reads about 95,760/month (3,192/day): two payment queries per minute, one deletion query per 5 minutes, one attachment query hourly. Retries, due records and index reads add usage. |
| Compute | At 1 billed CPU-second and 0.5 GiB per job, about 52,560 vCPU-seconds and 26,280 GiB-seconds/month. At 4 CPU-seconds/job, CPU exceeds the 180,000 free allowance by 30,240 seconds: approximately USD 0.73 CPU charge at USD 0.000024/second, before other use. Cold starts and retries must be measured. |
| Small assessment | Example: 10 testers, 100 consultations/month, 10,000 callable requests, 100,000 extra Firestore reads and 20,000 writes spread over the month, 0.5 GiB synthetic documents, 1 GiB downloaded. Expected application usage fits the stated free allowances if no day spikes; actual domain transactions, listeners, signalling and policy reads must be counted. |
| Admission overhead | Each hosted protected request adds current Auth lookup and at least two Firestore document reads; registration and mutation retries add writes. Direct Firestore Rules also read membership/invitation, with additional billed dependent reads possible even on denied requests. No cache is used to trade away revocation. |
| Storage / egress | Small synthetic files should remain modest. Standard storage free tier is region/billing-account dependent: 5 GB-months, 5,000 class A and 50,000 class B operations in eligible US regions. Access through callable base64 adds roughly 33% payload overhead and compute/Cloud Run egress; do not assume Storage's transfer allowance also covers this route or every destination. |
| Scheduler | Three jobs consume the three free jobs per billing account if unused elsewhere; otherwise USD 0.10/job/month (up to USD 0.30 for these three). Frequency does not change the per-job price. |
| Authentication | Ten dedicated testers are far below Identity Platform's 50,000 tier-1 MAU no-cost tier. Blocking triggers have their own compute/read costs and a seven-second response deadline. Custom tokens still require explicit admission checks. |
| Builds / artifacts | Deployment is not free merely because testing is small. About 60 exported endpoints can generate substantial builds and image revisions. For example, 60 two-minute builds use 120 build-minutes; free build minutes apply only to eligible machine types. At USD 0.006/minute, 120 billable e2-standard-2 minutes would be USD 0.72. Artifact storage of 1–10 GB would cost approximately USD 0.05–0.95/month after 0.5 GB free at USD 0.10/GB-month; shared layers, build bucket objects and actual images must be measured. |

Expected quiet/small-test operating cost is near USD 0 with available allowances,
plus possible build/artifact/log/egress charges. USD 0–5/month is a planning target,
not an enforced maximum. Bursts, abuse, long cold starts, repeated deployments,
large documents, expired allowances or paid backup/PITR can exceed USD 5.
Limits are **per function**, not a two-instance cap for the whole project.

Sources: [Cloud Run](https://cloud.google.com/run/pricing),
[Firestore](https://cloud.google.com/firestore/pricing),
[Cloud Storage](https://cloud.google.com/storage/pricing),
[Scheduler](https://cloud.google.com/scheduler/pricing),
[Identity Platform](https://cloud.google.com/identity-platform/pricing),
[Cloud Build](https://cloud.google.com/build/pricing),
[Artifact Registry](https://cloud.google.com/artifact-registry/pricing).

## Safe reductions

Implemented: zero minimum instances, bounded maximum instances/concurrency, private
admission, bounded upload/read sizes and unchanged bounded background query batches.
Attachment/read functions retain concurrency 2 for memory pressure. No always-on
poller, paid cache, VPC connector, NAT, public document bucket or TURN server is added.

Keep the current payment/deletion/attachment schedules while work may be pending;
slowing them changes expiry/retry/cleanup guarantees. Do not replace reliable
background work with app-open-only cleanup. A future event-driven design needs
its own reliability review. No recurring application job was removed in this phase.

For planned shutdown only: close admission/new checkouts, drain due payments and
refunds, finish deletion jobs and attachment cleanup, verify an approved recovery
snapshot, then pause schedules and record a resume/catch-up procedure. Do not pause
jobs merely because no tester is currently signed in.

Configure 7-day artifact cleanup after inspecting region/repository and rollback
needs; keep the verified source/lock/inventory for reproducible rebuilds. Remove
obsolete image revisions through supported cleanup, not unreviewed bucket deletion.
Avoid repeated no-change deployments. Use Standard storage; avoid paid PITR, TTL,
backup or scanning features unless explicitly approved. Review soft-delete/version
retention, logs and build staging storage; do not shorten audit/security retention
solely to save money without an approved policy.

## Monitoring and emergency control

Create an all-services, project-scoped USD 5 monthly budget with actual-spend alerts
at USD 2.50, USD 4.00 and USD 5.00, owner email and optional forecast alert. Budgets
are not hard caps and billing data/notifications can lag.
[Google budget guidance](https://cloud.google.com/billing/docs/how-to/budgets).

During assessment check daily: billing by service/SKU; function request counts,
latency, retries, instances and failures; Firestore reads/writes and denied access;
Storage bytes/operations; network egress; build minutes; artifact/log growth; due
payment/deletion/cleanup backlog. Use coarse aggregate metrics; never log tokens,
raw invitations, document contents or synthetic consultation bodies for monitoring.

At 50% investigate trends and unnecessary deployments; at 80% close new invitations
and new testing while draining existing work; at 100% stop new usage and investigate
immediately. Membership revocation blocks protected data, but public callable/Auth
attempts can still consume resources before rejection. Instance limits and admission
are not abuse-proof spending caps. Consider App Check/rate controls after supported
device/provider verification; it is not silently enabled or claimed here.

For an active abuse emergency, prioritize containment: disable affected public
function invocation/provider access or services using owner IAM, deny direct Rules
access, revoke memberships/invitations and tokens, and preserve incident evidence.
Pausing jobs or disabling billing is a last-resort owner action: it interrupts
payment reconciliation/deletion/cleanup and can affect data/service availability.
Record the backlog and perform verified catch-up after recovery. Do not automatically
disconnect billing at a budget threshold or claim that action erases data.
