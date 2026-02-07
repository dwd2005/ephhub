const { execPowerShell } = require('./utils');

function buildShellNewScript() {
  return `
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$WarningPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

if (-not ('AssocQuery' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

static class AssocQuery {
  public const uint ASSOCF_INIT_DEFAULTTOSTAR = 0x4;
  public const uint ASSOCF_NOTRUNCATE = 0x20;
  public const uint ASSOCSTR_FRIENDLYDOCNAME = 3;
  public const uint ASSOCSTR_DEFAULTICON = 15;

  [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)]
  public static extern uint AssocQueryString(uint flags, uint str, string pszAssoc, string pszExtra, StringBuilder pszOut, ref uint pcchOut);

  [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)]
  public static extern int SHLoadIndirectString(string pszSource, StringBuilder pszOutBuf, uint cchOutBuf, IntPtr ppvReserved);
}
"@
}

function Get-AssocString([string]$ext, [uint32]$strType) {
  $len = 0
  [AssocQuery]::AssocQueryString([AssocQuery]::ASSOCF_INIT_DEFAULTTOSTAR, $strType, $ext, $null, $null, [ref]$len) | Out-Null
  if ($len -le 0) { return '' }
  $sb = New-Object System.Text.StringBuilder($len)
  [AssocQuery]::AssocQueryString([AssocQuery]::ASSOCF_INIT_DEFAULTTOSTAR, $strType, $ext, $null, $sb, [ref]$len) | Out-Null
  return $sb.ToString()
}

function Resolve-IndirectString([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $text }
  if (-not $text.StartsWith('@')) { return $text }
  try {
    $buf = New-Object System.Text.StringBuilder(512)
    [AssocQuery]::SHLoadIndirectString($text, $buf, $buf.Capacity, [IntPtr]::Zero) | Out-Null
    $resolved = $buf.ToString()
    if ($resolved) { return $resolved }
  } catch {}
  return $text
}

$root = [Microsoft.Win32.Registry]::ClassesRoot
$exts = New-Object System.Collections.Generic.HashSet[string]
foreach ($name in $root.GetSubKeyNames()) {
  if (-not $name.StartsWith('.')) { continue }
  try {
    $sk = $root.OpenSubKey("$name\\ShellNew")
    if ($sk) {
      $exts.Add($name.ToLower()) | Out-Null
      $sk.Close()
    }
  } catch {}
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($ext in $exts) {
  $name = Get-AssocString $ext ([AssocQuery]::ASSOCSTR_FRIENDLYDOCNAME)
  $name = Resolve-IndirectString $name
  if (-not $name) { $name = $ext.ToUpper() }

  $icon = Get-AssocString $ext ([AssocQuery]::ASSOCSTR_DEFAULTICON)
  if (-not $icon) { $icon = "$env:SystemRoot\\System32\\shell32.dll,0" }

  $templatePath = $null
  $dataHex = $null
  $nullFile = $false

  try {
    $sk = $root.OpenSubKey("$ext\\ShellNew")
    if (-not $sk) {
      $extKey = $root.OpenSubKey($ext)
      if ($extKey) {
        $progId = $extKey.GetValue('')
        $extKey.Close()
        if ($progId) {
          $sk = $root.OpenSubKey("$progId\\ShellNew")
        }
      }
    }
    if ($sk) {
      $fileName = $sk.GetValue('FileName')
      if ($fileName) { $templatePath = $fileName }

      $data = $sk.GetValue('Data')
      if ($data -and $data -is [byte[]]) {
        $dataHex = ($data | ForEach-Object { $_.ToString('X2') }) -join ''
      }

      $nullFile = $sk.GetValue('NullFile') -ne $null
      $sk.Close()
    }
  } catch {}

  $results.Add([pscustomobject]@{
    extension = $ext
    name = $name
    iconPath = $icon
    templatePath = $templatePath
    data = $dataHex
    nullFile = $nullFile
  })
}

$json = $results | Sort-Object extension | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
[Console]::WriteLine([System.Convert]::ToBase64String($bytes))
exit 0
`;
}

async function getNewFileTypes() {
  const script = buildShellNewScript();
  const output = await execPowerShell(script);
  const cleaned = (output || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  let parsed = [];
  if (cleaned) {
    try {
      const jsonText = Buffer.from(cleaned, 'base64').toString('utf8');
      parsed = jsonText ? JSON.parse(jsonText) : [];
    } catch (err) {
      try {
        parsed = JSON.parse(cleaned);
      } catch (err2) {
        parsed = [];
        // 调试：输出解析失败信息（避免污染正常输出）
        if (process.env.DEBUG_SHELL_NEW === '1') {
          console.error('[newFileTypes] JSON parse failed');
          console.error('[newFileTypes] raw output last line:', cleaned.slice(0, 500));
        }
      }
    }
  }
  if (process.env.DEBUG_SHELL_NEW === '1') {
    const preview = Array.isArray(parsed) ? parsed.slice(0, 3) : parsed;
    console.error('[newFileTypes] parsed preview:', JSON.stringify(preview).slice(0, 500));
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((item) => ({
    extension: item.extension,
    name: item.name || item.extension.toUpperCase(),
    iconPath: item.iconPath || 'C:\\Windows\\System32\\shell32.dll,0',
    templatePath: item.templatePath || null,
    data: item.data || null,
    nullFile: !!item.nullFile
  }));
}

module.exports = { getNewFileTypes };
