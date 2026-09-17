$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$bundle = Join-Path $root 'src-tauri/target/release/bundle'
$setup = Join-Path $bundle "nsis/Companion Studio_${version}_x64-setup.exe"
$msi = Join-Path $bundle "msi/Companion Studio_${version}_x64_en-US.msi"
$exe = Join-Path $root 'src-tauri/target/release/companion-studio.exe'
foreach ($file in @($setup, $exe)) {
  if ((Get-Item -LiteralPath $file).VersionInfo.ProductVersion -ne $version) { throw "Wrong executable version: $file" }
}
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($msi, 0)
$view = $database.OpenView('SELECT Value FROM Property WHERE Property = ''ProductVersion''')
$view.Execute()
$record = $view.Fetch()
if (!$record -or $record.StringData(1) -ne $version) { throw 'Wrong MSI product version' }
$view.Close()
$view = $database.OpenView('SELECT File, FileName, Version FROM File')
$view.Execute()
$fileKey = $null
while ($record = $view.Fetch()) {
  if ($record.StringData(2) -like '*companion-studio.exe*') {
    $fileKey = $record.StringData(1)
    if ([version]$record.StringData(3) -ne [version]"$version.0") { throw 'Wrong packaged executable version' }
  }
}
$view.Close()
if (!$fileKey) { throw 'MSI has no Companion Studio executable' }
$nativeCode = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class CompanionInstallerReader {
 [DllImport("msi.dll", CharSet=CharSet.Unicode)] static extern uint MsiOpenDatabaseW(string path, IntPtr mode, out uint database);
 [DllImport("msi.dll", CharSet=CharSet.Unicode)] static extern uint MsiDatabaseOpenViewW(uint database, string query, out uint view);
 [DllImport("msi.dll")] static extern uint MsiViewExecute(uint view, uint record);
 [DllImport("msi.dll")] static extern uint MsiViewFetch(uint view, out uint record);
 [DllImport("msi.dll")] static extern uint MsiRecordReadStream(uint record, uint field, byte[] buffer, ref uint size);
 [DllImport("msi.dll")] static extern uint MsiCloseHandle(uint handle);
 static void Check(uint code) { if (code != 0) throw new Exception("MSI read failed: " + code); }
 public static void Extract(string source, string destination) {
  uint database=0, view=0, record=0;
  try {
   Check(MsiOpenDatabaseW(source, IntPtr.Zero, out database));
   Check(MsiDatabaseOpenViewW(database, "SELECT `Data` FROM `_Streams` WHERE `Name` = 'app.cab'", out view));
   Check(MsiViewExecute(view, 0)); Check(MsiViewFetch(view, out record));
   using (var output = new FileStream(destination, FileMode.CreateNew)) {
    byte[] buffer = new byte[65536];
    while (true) { uint size=(uint)buffer.Length; Check(MsiRecordReadStream(record, 1, buffer, ref size)); if(size==0) break; output.Write(buffer, 0, (int)size); }
   }
  } finally { if(record!=0) MsiCloseHandle(record); if(view!=0) MsiCloseHandle(view); if(database!=0) MsiCloseHandle(database); }
 }
}
'@
Add-Type -TypeDefinition $nativeCode
$inspection = Join-Path $root ('src-tauri/target/installer-review-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $inspection | Out-Null
$cabinet = Join-Path $inspection 'app.cab'
[CompanionInstallerReader]::Extract($msi, $cabinet)
& expand.exe $cabinet "-F:$fileKey" $inspection | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not extract packaged executable for inspection' }
$packaged = Join-Path $inspection $fileKey
if ((Get-Item -LiteralPath $packaged).VersionInfo.ProductVersion -ne $version) { throw 'Wrong extracted executable version' }
foreach ($file in @($exe, $packaged)) {
  $bytes = [System.IO.File]::ReadAllBytes($file)
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
  if ([BitConverter]::ToUInt16($bytes, $peOffset + 4) -ne 0x8664) { throw 'Expected Windows x64 executable' }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  foreach ($marker in @('run_provider_request', 'save_provider_profile', 'assess_chat_context')) {
    if (!$text.Contains($marker)) { throw "Packaged provider implementation missing: $marker" }
  }
}
Write-Output "Verified Windows $version installer versions, packaged x64 executable, and provider commands. No installation or API calls performed."
