<#
.SYNOPSIS
  Copy nexus x64/Release runtime DLLs into backend/runtime/ (one click).

.DESCRIPTION
  pose_backend.exe and test_adapter.exe output to backend/runtime/ (see CMakeLists).
  They depend on the nexus DLL chain at runtime (OpenCV / Qt5 / Nexus internal DLLs).
  This script copies top-level *.dll from nexus x64/Release into backend/runtime/,
  skipping dev files (.pdb/.lib/.exp). After copy, both exes run directly in runtime/.

.PARAMETER NexusRoot
  nexus repo root. Defaults to E:\workspace\nexus.

.PARAMETER Force
  Overwrite existing same-named files.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/copy-runtime.ps1
  powershell -ExecutionPolicy Bypass -File scripts/copy-runtime.ps1 -Force
#>
[CmdletBinding()]
param(
    [string]$NexusRoot = 'E:\workspace\nexus',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$SrcDir = Join-Path $NexusRoot 'x64\Release'
$DstDir = Join-Path $PSScriptRoot '..\runtime'
if (-not (Test-Path -LiteralPath $DstDir)) {
    New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
}
$DstDir = (Resolve-Path -LiteralPath $DstDir).Path

if (-not (Test-Path -LiteralPath $SrcDir)) {
    throw "nexus release dir not found: $SrcDir -- build MultimodalWeldSystem in nexus first."
}

$dlls = Get-ChildItem -LiteralPath $SrcDir -Filter '*.dll' -File
if ($dlls.Count -eq 0) {
    Write-Warning "No .dll found under $SrcDir -- nexus may not be built."
    exit 1
}

Write-Host "src   : $SrcDir"
Write-Host "dst   : $DstDir"
Write-Host ("dlls  : {0} found" -f $dlls.Count)

$copied = 0
$skipped = 0
foreach ($dll in $dlls) {
    $dst = Join-Path $DstDir $dll.Name
    if ((Test-Path -LiteralPath $dst) -and -not $Force) {
        $skipped++
        continue
    }
    Copy-Item -LiteralPath $dll.FullName -Destination $dst -Force
    $copied++
}

Write-Host ("done  : copied {0}, skipped {1} (use -Force to overwrite)" -f $copied, $skipped)
Write-Host "run   : cd $DstDir ; .\pose_backend.exe"
