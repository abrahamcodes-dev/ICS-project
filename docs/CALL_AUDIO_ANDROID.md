# Android consultation audio

## Findings and fix

Capture requests and validates microphone permission, requests an audio track,
and adds it to the peer before SDP negotiation. Signaling does not strip audio
or change codecs. WebRTC renders received audio natively, independently of
RTCView. The manifest already declares RECORD_AUDIO and MODIFY_AUDIO_SETTINGS.

The missing Android communication session is the leading repository-supported
cause: no caller requested audio focus, communication mode, or call routing.
The installed WebRTC RTCAudioSession implementation is iOS-only. This is a
confirmed implementation gap, not proof of the exact failure on both devices.
Pixel 7 was in MODE_NORMAL when inspected, but no active two-device call was
observed. Samsung A53 was not connected. Host microphone input may independently
be disabled on the emulator; an audio track can exist while capturing silence.

Added react-native-incall-manager 4.3.0, pinned using Expo CLI. Reviewed upstream
source and compiled it against Expo 57, RN 0.86.3, SDK 36, minSDK 24 and the
project's enabled New Architecture. Android autolinking includes its package.
No extra Expo config plugin or permission changes are needed for speaker,
earpiece or wired-headset routing. Bluetooth on Android 12+ remains outside this
fix: the existing app does not request BLUETOOTH_CONNECT. Do not infer Bluetooth
support from automatic wired-headset routing.

- Start communication audio after permissions and before capture. Native routing
  defaults to speaker for video and earpiece (speaker fallback) for audio.
- Offer explicit speaker/earpiece preferences and return to automatic routing.
  Native routes may prioritize a wired headset; the buttons request a preference,
  rather than claiming that a specific device is actually selected.
- Keep microphone mute scoped to the WebRTC audio track, not the system mic.
- Release audio focus, routing, proximity/wake resources and original audio
  settings on teardown, capture failure, late/cancelled acquisition and peer
  failure. A stale cleanup cannot stop a subsequent audio session.
- Actual audio-focus loss (-1/-2) ends the call safely, without automatic capture
  restart. Duck notifications (-3) do not end it. Existing background/blur/auth
  teardown remains in place. Ending a call does not complete the consultation.
- Detect unusable received audio tracks and support streamless track events.
- Once, five seconds after connection, development builds log only audio RTP
  packet counts and live remote audio-track count under `[call audio]`. No SDP,
  participant identifiers, addresses, recordings or patient data are logged.
  The timer and asynchronous result are guarded against teardown. This is a
  diagnostic snapshot, not a guarantee of audible speech.

Firebase configuration, signaling, authorization, appointments and clinical
records were not changed. No call was initiated for verification.

## Validation

- Mobile TypeScript: passed.
- Focused audio/media/peer/UI/session/signaling/discovery Jest checks: passed
  (82 distinct tests across the focused runs; latest audio checks rerun after
  final changes).
- Expo public configuration and merged Android manifest: validated.
- Native audio module Java compile and autolinking: passed.
- Full ARM64 + x86_64 development APK build: passed with installed JDK 17.
  Initial build with Android Studio JBR 25 failed because Android's Prefab task
  treated its native-access warning as an error. Only process-local JAVA_HOME
  was changed for the successful build; repository configuration is unchanged.
- Git whitespace checks: passed.
- Native listening/routing/interruption verification: pending. Only Pixel 7 was
  attached, Samsung A53 was absent, and Metro was unavailable on port 8081.

## Rebuild and install (PowerShell)

A **new development client is required on both devices**; Metro reload alone
cannot add the native module. Keep the local demo-calladoc emulators running.
Do not uninstall or clear app data.

From the repository root:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:NODE_ENV='development'
Push-Location mobile\android
.\gradlew.bat :app:assembleDebug '-PreactNativeArchitectures=arm64-v8a,x86_64'
Pop-Location

$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
# Connect/authorize A53 over USB and substitute its serial shown above.
$samsungSerial='REPLACE_WITH_A53_SERIAL'
$apk=(Resolve-Path mobile\android\app\build\outputs\apk\debug\app-debug.apk).Path
foreach ($serial in @('emulator-5554',$samsungSerial)) {
  & $adb -s $serial install -r $apk
  # Current Firebase config defaults to 127.0.0.1 over ADB reverse.
  foreach ($port in @(8081,9099,8080,5001,9199)) {
    & $adb -s $serial reverse "tcp:$port" "tcp:$port"
  }
}

Set-Location mobile
npx.cmd expo start --dev-client --localhost
```

With Metro running, in a second PowerShell terminal at the repository root:

```powershell
$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$samsungSerial='REPLACE_WITH_A53_SERIAL'
foreach ($serial in @('emulator-5554',$samsungSerial)) {
  & $adb -s $serial shell am start -a android.intent.action.VIEW -d 'calladoc://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.calladoc.app
}
```

If an existing environment explicitly uses a reachable LAN host, retain that
configuration rather than changing Firebase hosts for this audio fix.

## Device verification

1. In Pixel 7 Extended Controls > Microphone, enable host microphone input for
   the listening test. Check Windows microphone privacy permissions and host
   output volume. Do not inject recorded patient audio. Enable Android microphone
   access and set an audible **call** volume on both devices during the call.
2. Use an authorized existing synthetic consultation while it is eligible;
   retain the existing patient/doctor accounts and appointment. Do not modify
   lifecycle records to bypass timing restrictions.
3. Start a video call; speak alternately and verify both directions. Confirm video
   remains working. Repeat as an audio-only call, reverse caller/callee roles,
   and test speaker/earpiece, automatic output, mute/unmute and wired headphones.
4. In React Native DevTools, inspect the single `[call audio]` sample on each
   side. Audio packets must be sent and received and a live remote audio track
   should exist. Zero sent packets points toward capture/SDP; zero received
   packets toward sender/negotiation/transport. Positive counts still require a
   listening test (emulator silence can be transmitted in valid packets).
5. During the call, inspect audio mode/focus without dumping patient data:

   ```powershell
   & $adb -s emulator-5554 shell dumpsys audio | Select-String 'Actual mode|Requested mode|mAudioModeOwner|Active communication device'
   & $adb -s $samsungSerial shell dumpsys audio | Select-String 'Actual mode|Requested mode|mAudioModeOwner|Active communication device'
   ```

   Expect MODE_IN_COMMUNICATION while active and the previous mode after teardown.
6. Test reject/end, backgrounding, navigation away, repeated calls, microphone
   denial and another incoming phone call. Actual focus loss should release media
   and require explicit restart; ordinary duck notifications should not end it.
   Verify no leftover microphone indicator, focus owner, forced output or muted
   system microphone after teardown. Do not complete/cancel the consultation.
7. Repeat on **two physical devices** before accepting production audio quality:
   emulator host routing cannot validate earpiece fidelity, echo cancellation,
   Samsung audio-policy behavior, cellular interruptions or OEM headset routing.
   iOS audio management has not been device-tested in this Android checkpoint.

References: [upstream audio manager](https://github.com/react-native-webrtc/react-native-incall-manager),
[Android emulator microphone controls](https://developer.android.com/studio/run/emulator-extended-controls).
## SDK 57 compatibility warning (15 November 2026)

`react-native-incall-manager` 4.3.0 is retained. Expo Doctor classifies it as
**untested on the New Architecture**. This is a compatibility warning, not evidence
of a runtime failure or a successful device evaluation. The Doctor check is not
excluded or suppressed. A successful Android build does not resolve this warning.

Before end-to-end acceptance, verify audio on physical Android devices: microphone
permission and mute, earpiece/speaker routing, wired and Bluetooth headsets,
incoming-call/audio-focus interruptions, background/foreground recovery, and audio
release after rejection, cancellation, hang-up and network failure. Record device,
Android version and results; do not claim this verification from Jest or emulators.
