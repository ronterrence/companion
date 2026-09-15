$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot 'src-tauri\runtime'
$cacheDir = Join-Path $projectRoot 'src-tauri\target\runtime-cache'
New-Item -ItemType Directory -Force -Path $runtimeDir,$cacheDir | Out-Null
$archive = Join-Path $cacheDir 'llama-b10025-bin-win-cpu-x64.zip'
$expected = 'f1fe2ec55a80eabb525bc7334579327ea993a03d10cea9a8175971b57eb9c98b'
if (!(Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest -UseBasicParsing 'https://github.com/ggml-org/llama.cpp/releases/download/b10025/llama-b10025-bin-win-cpu-x64.zip' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
  throw 'Runtime checksum mismatch. Remove the cached archive and retry.'
}
Expand-Archive -LiteralPath $archive -DestinationPath $cacheDir -Force
Get-ChildItem -LiteralPath $cacheDir -Recurse -File | Where-Object { $_.Extension -eq '.dll' -or $_.Name -eq 'llama-server.exe' } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $runtimeDir -Force
}
$license = Join-Path $runtimeDir 'LICENSE-llama.cpp.txt'
Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b10025/LICENSE' -OutFile $license
Write-Output 'Prepared verified llama.cpp b10025 CPU runtime.'
