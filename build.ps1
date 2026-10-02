<#
    Gradle-free APK build for 邪恶鲸鱼 / 初音未来 (com.evilwhale.pet).

    Uses only the Android SDK command-line tools:
        aapt2 compile -> aapt2 link -> javac -> d8 -> zip dex -> zipalign -> apksigner

    Requires: a JDK (17+) and an Android SDK with build-tools + a platform.
    Point at them with -Sdk / -JavaHome, or set ANDROID_HOME / JAVA_HOME.

    Examples:
        .\build.ps1
        .\build.ps1 -Sdk C:\Android\Sdk -JavaHome "C:\Program Files\Java\jdk-21"
        .\build.ps1 -Api 34 -BuildTools 34.0.0

    Output: dist/EvilWhale-<version>.apk
#>
[CmdletBinding()]
param(
    [string]$Sdk,
    [string]$JavaHome,
    [int]$Api = 35,
    [string]$BuildTools = "35.0.0",
    [switch]$Release
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$Build     = Join-Path $Root 'build'
$Dist      = Join-Path $Root 'dist'
$Assets    = Join-Path $Root 'assets'
$Res       = Join-Path $Root 'res'
$Src       = Join-Path $Root 'src'
$Manifest  = Join-Path $Root 'AndroidManifest.xml'

# ---------------------------------------------------------------- discovery
# Resolve the SDK and JDK from explicit arguments, then the usual environment
# variables, then a couple of conventional locations.  Nothing here is
# machine-specific any more, so a fresh clone can build with no edits.
function Resolve-Sdk {
    param([string]$Given)
    if ($Given) { return $Given }
    foreach ($cand in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT,
                        'D:\zhuochong\sdk', "$env:LOCALAPPDATA\Android\Sdk")) {
        if ($cand -and (Test-Path (Join-Path $cand 'build-tools'))) { return $cand }
    }
    return $null
}

function Resolve-JavaHome {
    param([string]$Given)
    if ($Given) { return $Given }
    foreach ($cand in @($env:JAVA_HOME, 'D:\zulujava\21', 'D:\zulujava\17',
                        "$env:ProgramFiles\Java\jdk-21",
                        "$env:ProgramFiles\Java\jdk-17")) {
        if (-not $cand) { continue }
        if (Test-Path (Join-Path $cand 'bin\javac.exe')) { return $cand }
    }
    # also accept a wildcarded distribution directory (e.g. Temurin jdk-21.0.x)
    foreach ($pat in @("$env:ProgramFiles\Eclipse Adoptium\jdk-*",
                       "$env:ProgramFiles\Microsoft\jdk-*",
                       "$env:ProgramFiles\Java\jdk-*")) {
        foreach ($hit in @(Get-ChildItem $pat -ErrorAction SilentlyContinue)) {
            if (Test-Path (Join-Path $hit.FullName 'bin\javac.exe')) { return $hit.FullName }
        }
    }
    return $null
}

$Sdk = Resolve-Sdk $Sdk
$JavaHome = Resolve-JavaHome $JavaHome
if (-not $Sdk) {
    Write-Host "ERROR: could not find an Android SDK." -ForegroundColor Red
    Write-Host "  Pass -Sdk <path>, or set ANDROID_HOME."
    Write-Host "  It needs build-tools\$BuildTools and platforms\android-$Api."
    exit 1
}
if (-not $JavaHome) {
    Write-Host "ERROR: could not find a JDK (17 or newer)." -ForegroundColor Red
    Write-Host "  Pass -JavaHome <path>, or set JAVA_HOME."
    exit 1
}

# Design-only files (screenshot sheets and the measuring harness) must not
# ship inside the app, and neither should the untouched source artwork: the
# processed PNGs in the same folder are what the app actually draws.
$AssetExclude = @('preview.html', 'preview_frame.html', 'measure.html',
                  'whale.webp', 'miku.jpg')

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  ok: $msg" -ForegroundColor Green }

function Invoke-Tool {
    param([string]$Exe, [string[]]$Arguments, [string]$What)
    # Tools such as java/keytool/d8 write banners to stderr; with
    # ErrorActionPreference='Stop' PowerShell would treat that as fatal.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    if ($code -ne 0) {
        Write-Host ($out | Out-String)
        Fail "$What failed (exit $code)"
    }
    if ($out) { Write-Host ("  " + (($out | Out-String).Trim() -replace "`r?`n", "`n  ")) }
    return $out
}

function Get-ToolText {
    param([string]$Exe, [string[]]$Arguments)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = & $Exe @Arguments 2>&1 } finally { $ErrorActionPreference = $prev }
    return (($out | Out-String).Trim())
}

function Add-FileToZip {
    param([string]$ZipPath, [string]$EntryName, [string]$SourcePath)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Add-Type -AssemblyName System.IO.Compression
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        $existing = $zip.GetEntry($EntryName)
        if ($existing) { $existing.Delete() }
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $SourcePath, $EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
    } finally {
        $zip.Dispose()
    }
}

# ---------------------------------------------------------------- toolchain
Step "Locating toolchain"
if (-not (Test-Path $JavaHome)) { Fail "JDK not found at $JavaHome" }
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"
$java = Join-Path $JavaHome 'bin\java.exe'
$javac = Join-Path $JavaHome 'bin\javac.exe'
$keytool = Join-Path $JavaHome 'bin\keytool.exe'
foreach ($t in @($java, $javac, $keytool)) { if (-not (Test-Path $t)) { Fail "missing $t" } }
Ok "JDK $(Get-ToolText $java @('-version'))"

$bt = Join-Path $Sdk "build-tools\$BuildTools"
$aapt2 = Join-Path $bt 'aapt2.exe'
$d8 = Join-Path $bt 'd8.bat'
$zipalign = Join-Path $bt 'zipalign.exe'
$apksigner = Join-Path $bt 'apksigner.bat'
$androidJar = Join-Path $Sdk "platforms\android-$Api\android.jar"
foreach ($t in @($aapt2, $d8, $zipalign, $apksigner, $androidJar)) {
    if (-not (Test-Path $t)) { Fail "missing $t" }
}
Ok "aapt2      $aapt2"
Ok "d8         $d8"
Ok "android.jar $androidJar"

# -------------------------------------------------------------------- clean
Step "Preparing build directories"
if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Build, $Dist | Out-Null
$compiled = Join-Path $Build 'compiled'
$classes  = Join-Path $Build 'classes'
$dexDir   = Join-Path $Build 'dex'
$genDir   = Join-Path $Build 'gen'
$unsigned = Join-Path $Build 'unsigned.apk'
$aligned  = Join-Path $Build 'aligned.apk'
New-Item -ItemType Directory -Force -Path $compiled, $classes, $dexDir, $genDir | Out-Null
Ok "build dir $Build"

# Stage only the shipping assets.
$stagedAssets = Join-Path $Build 'assets'
New-Item -ItemType Directory -Force -Path $stagedAssets | Out-Null
$shipped = @()
foreach ($f in Get-ChildItem $Assets -File) {
    if ($AssetExclude -contains $f.Name) { continue }
    Copy-Item $f.FullName (Join-Path $stagedAssets $f.Name) -Force
    $shipped += $f.Name
}
Ok "staged assets: $($shipped -join ', ')"

# ----------------------------------------------------------------- keystore
Step "Signing key"
$ks = Join-Path $Root 'keystore\evilwhale.jks'
$ksPass = 'evilwhale'
$ksAlias = 'evilwhale'
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ks) | Out-Null
    Invoke-Tool $keytool @(
        '-genkeypair', '-v',
        '-keystore', $ks,
        '-alias', $ksAlias,
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-storepass', $ksPass, '-keypass', $ksPass,
        '-dname', 'CN=Evil Whale, OU=Pet, O=EvilWhale, L=Tokyo, S=Tokyo, C=JP'
    ) 'keytool -genkeypair' | Out-Null
    Ok "created $ks"
} else {
    Ok "reusing $ks"
}

# ------------------------------------------------------------- compile res
Step "aapt2 compile (resources)"
Invoke-Tool $aapt2 @('compile', '--dir', $Res, '-o', $compiled) 'aapt2 compile' | Out-Null
$flatCount = (Get-ChildItem $compiled -Filter *.flat -Recurse).Count
Ok "$flatCount compiled resources"

# ---------------------------------------------------------------- link res
Step "aapt2 link"
$linkArgs = @(
    'link',
    '-o', $unsigned,
    '-I', $androidJar,
    '--manifest', $Manifest,
    '--java', $genDir,
    '--min-sdk-version', '21',
    '--target-sdk-version', "$Api",
    '--version-code', '6',
    '--version-name', '2.0',
    '-A', $stagedAssets,
    '--auto-add-overlay'
)
$flatFiles = @(Get-ChildItem $compiled -Filter *.flat -Recurse | ForEach-Object { $_.FullName })
if ($flatFiles.Count -gt 0) { $linkArgs += $flatFiles }
Invoke-Tool $aapt2 $linkArgs 'aapt2 link' | Out-Null
if (-not (Test-Path $unsigned)) { Fail "aapt2 link produced no APK" }
Ok "linked $([math]::Round((Get-Item $unsigned).Length/1KB,1)) KB"

# ------------------------------------------------------------- compile java
Step "javac"
$javaFiles = @(Get-ChildItem $Src -Filter *.java -Recurse | ForEach-Object { $_.FullName })
$rJava = @(Get-ChildItem $genDir -Filter R.java -Recurse | ForEach-Object { $_.FullName })
$allJava = @($javaFiles) + @($rJava)
Write-Host "  sources: $($allJava.Count)"
$javacArgs = @(
    '-encoding', 'UTF-8',
    '-source', '8', '-target', '8',
    '-bootclasspath', $androidJar,
    '-classpath', $androidJar,
    '-d', $classes
) + $allJava
# -bootclasspath is unsupported on JDK 9+; use --release-style flags instead
$jdkVerText = Get-ToolText $java @('-version')
$jdkMajor = [int]([regex]::Match($jdkVerText, '"(\d+)').Groups[1].Value)
Write-Host "  javac source/target 8 (JDK major $jdkMajor)"
if ($jdkMajor -ge 9) {
    $javacArgs = @(
        '-encoding', 'UTF-8',
        '-source', '8', '-target', '8',
        '-classpath', $androidJar,
        '-d', $classes
    ) + $allJava
}
Invoke-Tool $javac $javacArgs 'javac' | Out-Null
$classCount = (Get-ChildItem $classes -Filter *.class -Recurse).Count
if ($classCount -eq 0) { Fail "javac produced no classes" }
Ok "$classCount classes"

# ----------------------------------------------------------------------- d8
Step "d8 (dex)"
$classFiles = @(Get-ChildItem $classes -Filter *.class -Recurse | ForEach-Object { $_.FullName })
$d8Args = @('--release', '--min-api', '21', '--lib', $androidJar, '--output', $dexDir) + $classFiles
Invoke-Tool $d8 $d8Args 'd8' | Out-Null
$dex = Join-Path $dexDir 'classes.dex'
if (-not (Test-Path $dex)) { Fail "d8 produced no classes.dex" }
Ok "classes.dex $([math]::Round((Get-Item $dex).Length/1KB,1)) KB"
# ------------------------------------------------------------- add dex to apk
Step "Packaging dex into APK"
$dexFiles = @(Get-ChildItem $dexDir -Filter *.dex | Sort-Object Name)
if ($dexFiles.Count -eq 0) { Fail "no dex files produced" }
foreach ($d in $dexFiles) {
    Add-FileToZip -ZipPath $unsigned -EntryName $d.Name -SourcePath $d.FullName
    Ok "added $($d.Name) ($([math]::Round($d.Length/1KB,1)) KB)"
}

# ------------------------------------------------------------------ zipalign
Step "zipalign"
Invoke-Tool $zipalign @('-f', '-p', '4', $unsigned, $aligned) 'zipalign' | Out-Null
Ok "aligned"

# ------------------------------------------------------------------- sign
Step "apksigner"
$outName = if ($Release) { 'EvilWhale-2.0-release.apk' } else { 'EvilWhale-2.0.apk' }
$final = Join-Path $Dist $outName
if (Test-Path $final) { Remove-Item $final -Force }
Invoke-Tool $apksigner @(
    'sign',
    '--ks', $ks,
    '--ks-key-alias', $ksAlias,
    '--ks-pass', "pass:$ksPass",
    '--key-pass', "pass:$ksPass",
    '--v1-signing-enabled', 'true',
    '--v2-signing-enabled', 'true',
    '--v3-signing-enabled', 'false',
    '--out', $final,
    $aligned
) 'apksigner sign' | Out-Null
Ok "signed -> $final"

# ------------------------------------------------------------------ verify
Step "Verifying"
Invoke-Tool $apksigner @('verify', '--verbose', '--print-certs', $final) 'apksigner verify' | Out-Null
$size = (Get-Item $final).Length
Write-Host ""
Write-Host "APK  : $final" -ForegroundColor Yellow
Write-Host ("size : {0:N2} MB ({1:N0} bytes)" -f ($size/1MB), $size) -ForegroundColor Yellow
