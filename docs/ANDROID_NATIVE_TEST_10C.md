# Checkpoint 10C — Android native verification

Date: 22 October 2026. **PARTIAL — two-party calling remains blocked.**

## Baseline and environment

- 10B committed as `59373488649891eb1aa4170ece9ae10e5efde682`
  (`fix: resolve doctor onboarding and Android workflow issues`), exactly the
  eight approved files. Staged whitespace check passed after removing one extra
  trailing blank line in the integration plan. Previously validated tests were
  not rerun; no application behavior changed for that commit.
- Reused Pixel_7 / emulator-5554, API 35 x86_64, existing development APK,
  Metro on 8081 and local Auth/Firestore/Functions/Storage services. Only one
  connected Android client and one configured AVD were available.
- All fixture/API operations explicitly used `demo-calladoc`, localhost emulator
  endpoints and synthetic accounts. Mobile emulator configuration uses 10.0.2.2.
  No production credentials, deployment, dependency installation or rebuild.
- Existing Firebase Java processes use Android Studio JBR; documented Temurin
  JDK 17 remains the Android build runtime. No global Java settings changed.
- Unrelated AuthForm/authUI changes, `.vscode/` and earlier 10A documentation
  were preserved. Tests exercised this working tree, not an untouched release.

## Calling results

| Scenario | Actual result |
|---|---|
| Eligible doctor enters consultation | PASS: fresh local synthetic appointment opened through the existing UI/callable. |
| Microphone permission denial | SAFE INTERRUPTION: no call started; Android background cleanup displayed Ended rather than the dedicated permission explanation. |
| Microphone permission grant | Granted; the prompt also interrupted the first attempt. Explicit retry then initialized audio and reached Ringing. |
| Outgoing audio and mute/unmute | PASS for local initialization/signaling and control transitions; no remote audio claim. |
| End outgoing call | PASS: Ending then Ended, media controls removed. |
| Camera permission and video initialization | Granted; explicit retry reached Ringing with Your camera preview/RTCView and video controls present. Actual preview pixels were not captured or visually verified. |
| Disable camera | PASS: preview removed and Enable camera displayed. |
| Re-enable camera | Attempted, but invitation expired before a conclusive result; NOT VERIFIED. |
| Switch camera | Action completed on a fresh invitation without an error; actual front/back image change NOT VERIFIED. |
| Unanswered invitation expiry | PASS: Expired displayed and media controls removed. |
| Background/foreground | PASS for outgoing invitation: returning displayed Ended and background explanation, with no local preview/media controls. No automatic resume. |
| Navigation and later logout | Returned to doctor workspace, then login; administrator logout also returned to login. Logout during an established call NOT VERIFIED. |
| Unauthorized call access | PASS: authenticated nonparticipant administrator getConsultationCall returned HTTP 403. |
| Two participants, acceptance, remote audio/video | BLOCKED: second independently authenticated native client unavailable. No fake SDP/peer used to claim media success. |
| Network interruption/reconnection of a connected call | BLOCKED by the same missing two-party baseline; no successful recovery claim. |

The active fixture used appointment/consultation ID
`dded00ed0bc739f1d9bd89a1bba272ac9ab6e895732d22a352b19d3236c17776`,
22 October 04:00–04:30 UTC. A guarded emulator-only helper created a coherent
synthetic appointment, availability revision and booking locks without changing
existing appointments or the system clock. It is now historical; do not reuse it
as a current call window. No call recordings were made.

### Permission interruption limitation

Android permission activities triggered the existing `AppState` background
boundary in both the hook and call screen. Cleanup invalidated pending capture,
so granting permission did not start signaling until **Check for another call**
and a second explicit start. Denial likewise remained safe, but the generic
background/Ended message is misleading. This is a reproducible UX limitation,
not evidence of authorization failure. No speculative exception to background
privacy was added. A future focused correction must distinguish permission UI
from actual backgrounding without allowing late capture after leaving the app.

## Private credential results

Created a separate synthetic pending doctor through authenticated registration,
draft, prepare/upload/finalize and submission operations; three documents were
reviewed through the existing administrator UI. Request:
`7e81ba37-f77b-4b23-a904-de124f2e65f0`.

| Scenario | Actual result |
|---|---|
| PDF | PASS: native viewer visibly rendered “CallADoc synthetic PDF test”. One synthetic page only; complex/multipage PDFs not tested. |
| JPEG | PASS: visible green SYNTHETIC 10C card. |
| PNG | PASS: visible green SYNTHETIC 10C card. |
| Private temporary storage | PASS: selected files appeared under app-private cache/calladoc-review-* with matching extensions. |
| Close cleanup | PASS: PDF and JPEG cache files disappeared after closing. |
| Background cleanup | PASS: PNG viewer dismissed and cache file disappeared on background/foreground. |
| Logout cleanup | PASS: no matching temporary files remained after administrator logout. |
| Unauthorized reads | PASS: patient and unrelated approved doctor were denied each of the three credential objects, six HTTP 403 responses. |
| Public URLs | No download URL generated. Existing authenticated Storage download and private file rendering were used; Rules and trustAllCerts=false unchanged. |

Synthetic visual evidence remains outside Git under `%TEMP%`:
`calladoc-10c-pdf.png`, `calladoc-10c-jpeg.png`, `calladoc-10c-png.png`.
Fixture helpers/files are local-only. No real medical documents were used.

## Issues, validation and handoff

- Login automation initially tapped controls obscured by the keyboard and sent
  Back at the wrong time. Separate focus/input/dismiss steps recovered login;
  this did not establish an application crash. An app-only restart was attempted
  during diagnosis. The inspected Android crash buffer was empty.
- Approval-review usage limits interrupted execution; rejected commands did not
  execute. Work resumed after user continuation. A camera-preview screenshot was
  separately refused under the no-media-recording restriction; none was saved.
- No production source, native configuration or Rules changes in 10C. No new
  automated test count is claimed; no unchanged suites rerun. Manual emulator
  checks above plus Git whitespace verification are the evidence for this gate.
- Only this report and the integration plan change for 10C. Nothing from 10C is
  staged/committed, and nothing was pushed or deployed.

**Before closing calling verification:** supply a second authorized native client
and a fresh eligible appointment; verify invitation acceptance/rejection, actual
bidirectional audio/video, camera re-enable, mute at the receiver, both-end
termination, network interruption and logout during a connected call. The native
peer currently defaults to an empty ICE-server list; cross-network STUN/TURN
readiness is not established. No production TURN credentials were introduced.

10D may address other testing areas with these open items recorded, but 10C must
not be represented as a full voice/video end-to-end PASS.
