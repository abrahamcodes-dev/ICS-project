# Local Firebase only. Invoke from a fresh terminal; no deployment or live project fallback.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Node22,
    [Parameter(Mandatory=$true)][string]$JavaHome,
    [string]$ImportPath,
    [switch]$Fresh
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$node = (Resolve-Path -LiteralPath $Node22).Path
$java = Join-Path $JavaHome 'bin\java.exe'
if (!(Test-Path -LiteralPath $java)) { throw 'JavaHome must contain bin\java.exe (Java 21 or newer).' }
if ((& $node --version) -notmatch '^v22\.') { throw 'Firebase Functions requires the existing Node 22 runtime.' }
if ([bool]$ImportPath -eq [bool]$Fresh) { throw 'Choose -ImportPath for verified recovery, or explicitly -Fresh for a new empty environment.' }
$importArguments = @()
if ($ImportPath) {
    $snapshotRoot = (Resolve-Path -LiteralPath $ImportPath).Path
    $manifestPath = Join-Path $snapshotRoot 'snapshot-manifest.json'
    if (!(Test-Path -LiteralPath $manifestPath)) { throw 'Use a complete snapshot created by Snapshot-DemoEmulators.cjs; older exports require review.' }
    $snapshotManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if (!$snapshotManifest.complete -or $snapshotManifest.projectId -ne 'demo-calladoc') { throw 'Snapshot is incomplete or belongs to another project.' }
    foreach ($entry in $snapshotManifest.hashes.PSObject.Properties) {
        $snapshotFile = [IO.Path]::GetFullPath((Join-Path $snapshotRoot $entry.Name))
        if (!$snapshotFile.StartsWith($snapshotRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Snapshot path leaves its directory.' }
        if (!(Test-Path -LiteralPath $snapshotFile) -or (Get-FileHash -LiteralPath $snapshotFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) { throw 'Snapshot checksum mismatch.' }
    }
    $snapshotMetadata = Get-Content -LiteralPath (Join-Path $snapshotRoot 'firebase-export-metadata.json') -Raw | ConvertFrom-Json
    foreach ($service in @('auth','firestore','storage')) { if (!$snapshotMetadata.$service) { throw 'A complete Auth/Firestore/Storage export is required.' } }
    if ($snapshotMetadata.auth.path -ne 'auth_export' -or $snapshotMetadata.firestore.path -ne 'firestore_export' -or $snapshotMetadata.storage.path -ne 'storage_export' -or $snapshotMetadata.firestore.metadata_file -ne 'firestore_export/firestore_export.overall_export_metadata') { throw 'Unexpected snapshot layout; review it before recovery.' }
    $importArguments = @('--import',$snapshotRoot)
}
foreach ($port in @(4400,8080,9099,5001,9199)) {
    $probe = New-Object Net.Sockets.TcpClient
    try { $pending = $probe.ConnectAsync('127.0.0.1',$port); if ($pending.Wait(500) -and $probe.Connected) { throw "Port $port is occupied; no services were stopped." } }
    catch [AggregateException] { }
    finally { $probe.Dispose() }
}
if (!(Test-Path -LiteralPath (Join-Path $repo 'functions\lib\index.js'))) { throw 'Build Functions first: npm --prefix functions run build' }
$cli = Join-Path $repo 'functions\node_modules\firebase-tools\lib\bin\firebase.js'
if (!(Test-Path -LiteralPath $cli)) { throw 'Existing local Firebase CLI was not found; no packages were installed.' }
$keys = @('PATH','JAVA_HOME','JAVA_TOOL_OPTIONS','XDG_CONFIG_HOME','FUNCTIONS_DISCOVERY_TIMEOUT','DEBUG','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FIREBASE_CONFIG','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_QUOTA_PROJECT')
$prior = @{}
foreach ($key in $keys) { $prior[$key] = [Environment]::GetEnvironmentVariable($key,'Process') }
try {
    $env:PATH = "$(Split-Path $node -Parent);$JavaHome\bin;$env:PATH"
    $env:JAVA_HOME = $JavaHome
    $env:JAVA_TOOL_OPTIONS = '-Djava.net.preferIPv4Stack=true'
    $env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
    $env:DEBUG = ''
    # Do not reuse a signed-in CLI's cached operator credentials for demo emulators.
    $env:XDG_CONFIG_HOME = Join-Path $env:TEMP ('calladoc-demo-cli-' + [guid]::NewGuid().ToString('N'))
    foreach ($key in @('GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FIREBASE_CONFIG')) {
        [Environment]::SetEnvironmentVariable($key,$null,'Process')
    }
    $env:GCLOUD_PROJECT = 'demo-calladoc'
    $env:GOOGLE_CLOUD_PROJECT = 'demo-calladoc'
    $env:GOOGLE_CLOUD_QUOTA_PROJECT = 'demo-calladoc'
    Write-Host 'Starting local demo-calladoc emulators with Node 22. Existing live project defaults are ignored.'
    & $node $cli emulators:start --project demo-calladoc --config (Join-Path $repo 'firebase.json') --only auth,firestore,functions,storage @importArguments
    if ($LASTEXITCODE -ne 0) { throw "Demo emulators exited with code $LASTEXITCODE. Check port conflicts and Java compatibility." }
} finally {
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key,$prior[$key],'Process') }
}
