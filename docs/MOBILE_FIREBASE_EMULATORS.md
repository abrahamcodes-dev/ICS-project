# Local Android Firebase emulators

Use only the explicit demo-calladoc project and synthetic data. This procedure does
not deploy or connect to live Firebase. Main ports are Auth 9099, Firestore 8080,
Functions 5001, Storage 9199, Hub 4400; Metro uses 8081.

## Runtime selection

Use the installed Node 22.23.3 runtime from functions/.nvmrc. Set a shell variable
`$node22` to its full node.exe path. On this machine the existing executable is:

    C:\Users\eyoel\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe

This cache path may disappear; verify `& $node22 --version` before use. No download
is performed by the scripts. Put its directory first on PATH when child commands
invoke node. Native APK builds use Temurin JDK 17. Firebase emulators need Java 21+
(the installed Android Studio JBR 25.0.3 works); do not change global Java settings.

## Preserve current state before any restart

Leave the existing suite running during preparation. Close or idle clients so no
payments, uploads or account changes occur during the export; exports across Auth,
Firestore and Storage are not one atomic transaction. From the repository root:

    & $node22 scripts/Snapshot-DemoEmulators.cjs

The helper exports current Auth/Firestore/Storage directly to a NEW TEMP directory.
It never stops services, imports old data or overwrites a backup. It prints the
verified snapshot path, account count, James fixture presence and blob count without
printing passwords/tokens. A completion manifest with file hashes is written last.
If any step fails, DO NOT restart: keep the running services and investigate. Keep
backups private and outside Git. Existing older exports remain untouched.

Only after a complete snapshot, deliberately stop the known suite in its owning
terminal, then start from the JUST CREATED snapshot (not a pre-James import path):

    .\scripts\Start-DemoEmulators.ps1 -Node22 $node22 -JavaHome 'C:\Program Files\Android\Android Studio\jbr' -ImportPath '<new verified snapshot directory>'

The helper verifies the completion manifest/checksums and refuses occupied ports.
It restores all three data services and uses a fresh unsigned CLI configuration.
It does not set export-on-exit to overwrite your recovery snapshot. Create another
fresh snapshot before every later restart. `-Fresh` replaces `-ImportPath` ONLY for
an explicitly intended new empty environment; never use it to recover current data.
Build Functions with Node 22 before starting if source changed:

    & $node22 functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json

## Metro and Android forwarding

In mobile/, with the Node 22 directory first on PATH, set process-local variables:

    $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='true'
    $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1'
    $env:EXPO_NO_DOTENV='1'
    node --dns-result-order=ipv4first node_modules/expo/bin/cli start --dev-client --localhost --port 8081 --max-workers 1

IPv4-first avoids Metro binding only to ::1 while ADB forwards 127.0.0.1. Do not
combine --offline and --localhost. Use an existing native development client, not
Expo Go. A new native dependency requires an APK rebuild; a JS reload cannot add it.

Configure only your authorized device (inspect `adb devices` first):

    $adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    & $adb devices
    $device='emulator-5554' # replace with the authorized USB device serial
    foreach($port in 8081,9099,8080,5001,9199){ & $adb -s $device reverse "tcp:$port" "tcp:$port" }

Open CallADoc and connect the development client to http://127.0.0.1:8081. Android
Studio emulators may instead use EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2.
The code supports the host override and physical Android USB forwarding. No LAN
firewall exposure is needed. Fully restart the app after configuration changes.
Initialization connects all SDKs synchronously, rejects mismatched reuse, prohibits
emulator mode in production builds and currently supports Android only.

## Safety and evidence

Server unavailability never switches a demo SDK to live services. Do not weaken
Rules, clear app data, reset accounts or import an older snapshot to diagnose a
network failure. Restart only the Android app for payment-recovery acceptance while
leaving Firebase and Metro running. Use existing registration/verification/fee/
availability workflows for fixtures; synthetic approval is not real medical licensing.

See [stabilisation preparation](STABILISATION_PREPARATION.md) for regression copies.
They use separate projects/ports and must not target this manual environment.
Historical Android records and payment reports retain their original dates and
limits; this setup procedure does not claim new native acceptance results.
