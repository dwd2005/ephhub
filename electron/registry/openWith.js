const { execPowerShell } = require('./utils');

function buildEnumScript(ext) {
  return `
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$WarningPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$ext = '${ext.replace(/'/g, "''")}'
if (-not ('AssocEnum' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("F04061AC-1659-4A3F-A954-775AA57FC083"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAssocHandler {
  void GetName([MarshalAs(UnmanagedType.LPWStr)] out string ppsz);
  void GetUIName([MarshalAs(UnmanagedType.LPWStr)] out string ppsz);
  void GetIconLocation([MarshalAs(UnmanagedType.LPWStr)] out string ppsz, out int pIndex);
  int IsRecommended();
  void MakeDefault([MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
  void Invoke([MarshalAs(UnmanagedType.Interface)] object pdo);
  void CreateInvoker([MarshalAs(UnmanagedType.Interface)] object pdo, out object ppInvoker);
}

[ComImport, Guid("973810AE-9599-4B88-9E4D-6EE98C9552DA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEnumAssocHandlers {
  void Next(uint celt, out IAssocHandler rgelt, out uint pceltFetched);
}

static class AssocEnum {
  [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
  public static extern int SHAssocEnumHandlers(string pszExtra, uint assocFilter, out IEnumAssocHandlers ppEnum);
}
"@
}

$enum = $null
[AssocEnum]::SHAssocEnumHandlers($ext, 0, [ref]$enum) | Out-Null
if ($null -eq $enum) {
  $json = @() | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  [Console]::WriteLine([System.Convert]::ToBase64String($bytes))
  exit 0
}

$list = New-Object System.Collections.Generic.List[object]
while ($true) {
  $handler = $null
  $fetched = 0
  $enum.Next(1, [ref]$handler, [ref]$fetched)
  if ($fetched -eq 0) { break }
  $name = $null
  $ui = $null
  $icon = $null
  $index = 0
  try { $handler.GetName([ref]$name) } catch {}
  try { $handler.GetUIName([ref]$ui) } catch {}
  try { $handler.GetIconLocation([ref]$icon, [ref]$index) } catch {}
  $isRec = $false
  try { if ($handler.IsRecommended() -eq 0) { $isRec = $true } } catch {}
  $list.Add([pscustomobject]@{ name = $name; displayName = $ui; iconPath = $icon; iconIndex = $index; isDefault = $isRec })
}

$json = $list | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
[Console]::WriteLine([System.Convert]::ToBase64String($bytes))
exit 0
`;
}

function buildInvokeScript(handlerName, filePath) {
  return `
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$handlerName = '${handlerName.replace(/'/g, "''")}'
$filePath = '${filePath.replace(/'/g, "''")}'

if (-not ('AssocEnum' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("F04061AC-1659-4A3F-A954-775AA57FC083"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAssocHandler {
  void GetName([MarshalAs(UnmanagedType.LPWStr)] out string ppsz);
  void GetUIName([MarshalAs(UnmanagedType.LPWStr)] out string ppsz);
  void GetIconLocation([MarshalAs(UnmanagedType.LPWStr)] out string ppsz, out int pIndex);
  int IsRecommended();
  void MakeDefault([MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
  void Invoke([MarshalAs(UnmanagedType.Interface)] object pdo);
  void CreateInvoker([MarshalAs(UnmanagedType.Interface)] object pdo, out object ppInvoker);
}

[ComImport, Guid("973810AE-9599-4B88-9E4D-6EE98C9552DA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEnumAssocHandlers {
  void Next(uint celt, out IAssocHandler rgelt, out uint pceltFetched);
}

static class AssocEnum {
  [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
  public static extern int SHAssocEnumHandlers(string pszExtra, uint assocFilter, out IEnumAssocHandlers ppEnum);
}
"@
}

Add-Type -AssemblyName System.Windows.Forms
$enum = $null
$ext = [System.IO.Path]::GetExtension($filePath)
[AssocEnum]::SHAssocEnumHandlers($ext, 0, [ref]$enum) | Out-Null
if ($null -eq $enum) { exit 1 }

$target = $null
while ($true) {
  $handler = $null
  $fetched = 0
  $enum.Next(1, [ref]$handler, [ref]$fetched)
  if ($fetched -eq 0) { break }
  $name = $null
  try { $handler.GetName([ref]$name) } catch {}
  if ($name -eq $handlerName) { $target = $handler; break }
}

if ($null -eq $target) { exit 2 }

# 使用 DataObject 传递文件路径，触发 IAssocHandler.Invoke
$do = New-Object System.Windows.Forms.DataObject
$col = New-Object System.Collections.Specialized.StringCollection
$col.Add($filePath) | Out-Null
$do.SetFileDropList($col)
$target.Invoke($do)
`;
}

async function getOpenWithApps(ext) {
  if (!ext) return [];
  const script = buildEnumScript(ext);
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
          console.error('[openWith] JSON parse failed');
          console.error('[openWith] raw output last line:', cleaned.slice(0, 500));
        }
      }
    }
  }
  if (process.env.DEBUG_SHELL_NEW === '1') {
    const preview = Array.isArray(parsed) ? parsed.slice(0, 3) : parsed;
    console.error('[openWith] parsed preview:', JSON.stringify(preview).slice(0, 500));
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((item) => item && item.name)
    .map((item) => {
      const iconPath = item.iconPath
        ? item.iconIndex !== null && item.iconIndex !== undefined
          ? `${item.iconPath},${item.iconIndex}`
          : item.iconPath
        : 'C:\\Windows\\System32\\shell32.dll,0';
      return {
        name: item.name,
        displayName: item.displayName || item.name,
        command: `com:${item.name}`,
        iconPath,
        isDefault: !!item.isDefault
      };
    });
}

async function invokeOpenWithHandler(handlerName, filePath) {
  const script = buildInvokeScript(handlerName, filePath);
  await execPowerShell(script);
  return true;
}

module.exports = { getOpenWithApps, invokeOpenWithHandler };
