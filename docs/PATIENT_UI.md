# C8B patient presentation workflow

Patient Home offers Find a doctor, My appointments and My profile, plus the next
scheduled appointment in the latest 50 records. Home, Doctors, Appointments and
Profile are typed stack destinations with shared themed navigation actions; no
additional tab/navigation package is installed. Existing consultation routes remain.

Appointment reads reuse the C7 participant-bound listener. Cards show backend
scheduled/completed/cancelled/no_show states and local device times. Consultation
entry retains the C7 time/participant checks and authoritative backend authorization.
The bounded latest-50 view is not a complete appointment archive.

Doctor directory listing is explicitly denied by current Firestore rules. Doctors
therefore loads only individual approved public profiles for doctor IDs found in
the patient's appointments, searchable by name/specialty. No list permission or
new discovery endpoint is invented. Patients with no appointments have an empty
doctor list; general directory discovery requires a separately approved backend
capability. Unavailable/revoked profiles show a safe error. Verification reflects
the authorized read, not a permanent guarantee. Private credentials are never read.

Doctor profiles show name/specialty and real next-seven-UTC-date availability from
getAvailableAppointmentTimes. No ratings or credential claims are fabricated.
Mobile booking remains unconnected: the existing legacy appointmentService writes
retired schemas and is not used. The disabled booking action explicitly says no
appointment was created. Account Profile shows canonical name/email and sign-out;
health profile editing remains unfinished.

## Demonstration

Start the existing Android development build with `cd mobile` then
`npx expo start --dev-client`. Sign in as an authorized active patient. On Home,
open My appointments, select an existing scheduled appointment and Open consultation
during its eligible window. The C7 call screen and media lifecycle are unchanged.
Use Doctors to search linked doctors, View doctor for public details/real times,
and Profile for account details/sign-out. Test both system color schemes.

An available authorized backend, existing valid appointments and approved doctors
are prerequisites for populated views. This increment performs no deployment,
booking, real authentication or two-device calling test. Device visual/accessibility
checks and the existing STUN/TURN/network validation remain outstanding.
