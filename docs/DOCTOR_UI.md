# C8C doctor workspace

Approved active doctors enter a workspace with persistent Home, Schedule,
Consultations and Profile bottom tabs. It uses native accessible tab controls
inside the existing stack, with no new navigation dependency. Only the selected
tab is mounted; switching tabs or opening a consultation stops its reads/timers.
The existing C7 ConsultationRoom stack route and calling lifecycle are unchanged.

Home shows canonical name/verification status, today's appointments and the next
scheduled consultation in the latest 50 records. Schedule accepts a local calendar
date. Consultations separates upcoming/active records from previous/canceled ones.
Cards preserve backend statuses and the existing participant/time eligibility hint;
the backend remains authoritative. No patient names, health data or statistics are
invented or fetched. The latest-50 bound is not a complete historical schedule.

Availability is a real integration gap: doctorAvailability denies all client reads;
getAvailableAppointmentTimes is patient-only. replaceDoctorAvailabilityDay exists
but requires a trusted current revision unavailable through this doctor read surface.
No raw reads, guessed revisions or simulated writes are attempted. Availability
view/edit controls are explicitly unavailable pending an approved backend read
contract and a later management adapter. Appointment records are not open slots.

Profile uses owner-only doctorProfiles/{uid} get for the stored professional name,
specialty, phone, registration number and issuing authority, plus canonical account
name/email/verification. Private request metadata and credentials are not returned
by the mobile adapter. Profile fields are stored values, not invented qualifications.
Editing and verification submission remain unfinished. Pending/rejected/disabled
doctors retain the C8A status screen and cannot enter this workspace.

## Android demo

Run `cd mobile` then `npx expo start --dev-client`; press `a` for the Android emulator
or open the installed development build on a reachable physical device. Sign in
with an authorized active approved doctor. Home shows actual appointment data;
Schedule filters by YYYY-MM-DD in the device time zone; Consultations opens an
eligible appointment through C7; Profile displays account/professional fields and
sign-out. Try both OS themes. An available authorized backend and existing data
are required. No Firebase deployment, availability writes, device visual check or
two-device call verification was performed for this increment.
