const { exec } = require('child_process');
const iconv = require('iconv-lite');
const path = require('path');
const fs = require('fs');

function execReg(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true, encoding: 'buffer' }, (err, stdout) => {
      if (err) return reject(err);
      try {
        // Windows reg.exe 输出为本地代码页（常见 cp936），这里尝试优先按 cp936 解析
        const decoded = iconv.decode(stdout, 'cp936');
        resolve(decoded || '');
      } catch (e) {
        resolve(stdout.toString('utf8'));
      }
    });
  });
}

function parseDefaultValue(output) {
  // reg query output lines: <key>\n    (Default)    REG_SZ    value
  // 匹配任何包含 REG_SZ 的行，提取后面的值
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配格式: (xxx)    REG_SZ    value 或 REG_SZ    value
    const match = trimmed.match(/REG_[A-Z]+\s+([^\r\n]+)/);
    if (match) {
      return match[1].trim();
    }
  }
  return '';
}

async function getProgId(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}" /ve`);
    return parseDefaultValue(res);
  } catch (err) {
    return '';
  }
}

async function getOpenWithList(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}\\OpenWithList"`);
    const lines = res.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((line) => line && !line.startsWith('HKEY'))
      .map((line) => line.split(/\s+/)[0])
      .filter((v) => v && v !== '(Default)');
  } catch (err) {
    return [];
  }
}

async function getOpenWithProgIds(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}\\OpenWithProgids"`);
    const lines = res.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((line) => line && !line.startsWith('HKEY'))
      .map((line) => line.split(/\s+/)[0])
      .filter((v) => v && v !== '(Default)');
  } catch (err) {
    return [];
  }
}

async function getCommandAndIconForApp(appExe) {
  const base = `HKCR\\Applications\\${appExe}\\shell\\open`;
  let command = '';
  let icon = '';
  try {
    const res = await execReg(`reg query "${base}\\command" /ve`);
    command = parseDefaultValue(res);
  } catch (err) {}
  try {
    const res = await execReg(`reg query "${base}" /v Icon`);
    const match = res.match(/Icon\s+REG_[A-Z]+\s+([^\r\n]+)/i);
    if (match) icon = match[1].trim();
  } catch (err) {}
  return { command, icon };
}

async function getCommandAndIconForProgId(progId) {
  let command = '';
  let icon = '';
  try {
    const res = await execReg(`reg query "HKCR\\${progId}\\shell\\open\\command" /ve`);
    command = parseDefaultValue(res);
  } catch (err) {}
  try {
    const res = await execReg(`reg query "HKCR\\${progId}\\DefaultIcon" /ve`);
    icon = parseDefaultValue(res);
  } catch (err) {}
  return { command, icon };
}

async function getSystemOpenWithList(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\SystemFileAssociations\\${ext}\\OpenWithList"`);
    const lines = res.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((line) => line && !line.startsWith('HKEY'))
      .map((line) => line.split(/\s+/)[0])
      .filter((v) => v && v !== '(Default)');
  } catch (err) {
    return [];
  }
}

async function getSystemApplications(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\SystemFileAssociations\\${ext}\\Applications"`);
    const lines = res.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((line) => line && !line.startsWith('HKEY'))
      .map((line) => line.split(/\s+/)[0])
      .filter((v) => v && v !== '(Default)');
  } catch (err) {
    return [];
  }
}

async function getCommandAndIconForSystemApp(appExe) {
  const base = `HKCR\\SystemFileAssociations\\Applications\\${appExe}`;
  let command = '';
  let icon = '';
  try {
    const res = await execReg(`reg query "${base}\\shell\\open\\command" /ve`);
    command = parseDefaultValue(res);
  } catch (err) {}
  try {
    const res = await execReg(`reg query "${base}\\shell\\open" /v Icon`);
    const match = res.match(/Icon\s+REG_[A-Z]+\s+([^\r\n]+)/i);
    if (match) icon = match[1].trim();
  } catch (err) {}
  if (!command) {
    try {
      const res = await execReg(`reg query "${base}\\shell\\open\\command" /ve`);
      command = parseDefaultValue(res);
    } catch (err) {}
  }
  return { command, icon };
}

async function getFriendlyNameForProgId(progId) {
  try {
    const res = await execReg(`reg query "HKCR\\${progId}" /ve`);
    const name = parseDefaultValue(res);
    if (name) return name;
  } catch (err) {}
  return progId;
}

async function getFriendlyNameForApp(appExe) {
  try {
    const res = await execReg(`reg query "HKCR\\Applications\\${appExe}" /ve`);
    const name = parseDefaultValue(res);
    if (name) return name;
  } catch (err) {}
  return appExe;
}

async function getAllApplications() {
  try {
    const res = await execReg(`reg query "HKCR\\Applications"`);
    const lines = res.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((line) => line && !line.startsWith('HKEY') && line.includes('.exe'))
      .map((line) => line.split(/\s+/)[0])
      .filter((v) => v && v !== '(Default)');
  } catch (err) {
    return [];
  }
}

async function getOpenWithApps(ext) {
  const seen = new Map(); // key -> app entry
  const tasks = [];

  const progId = await getProgId(ext);
  if (progId) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForProgId(progId);
        const key = progId.toLowerCase();
        if (command && !seen.has(key)) {
          const displayName = await getFriendlyNameForProgId(progId);
          seen.set(key, {
            name: progId,
            displayName: displayName,
            command,
            iconPath: icon,
            isDefault: true
          });
        }
      })()
    );
  }

  const openWithList = await getOpenWithList(ext);
  for (const exe of openWithList) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForApp(exe);
        const key = exe.toLowerCase();
        if (command && !seen.has(key)) {
          seen.set(key, {
            name: exe,
            displayName: await getFriendlyNameForApp(exe),
            command,
            iconPath: icon,
            isDefault: false
          });
        }
      })()
    );
  }

  const openWithProgIds = await getOpenWithProgIds(ext);
  for (const pid of openWithProgIds) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForProgId(pid);
        const key = pid.toLowerCase();
        if (command && !seen.has(key)) {
          const displayName = await getFriendlyNameForProgId(pid);
          seen.set(key, {
            name: pid,
            displayName: displayName,
            command,
            iconPath: icon,
            isDefault: false
          });
        }
      })()
    );
  }

  const systemOpenWithList = await getSystemOpenWithList(ext);
  for (const exe of systemOpenWithList) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForApp(exe);
        const key = `system-${exe.toLowerCase()}`;
        if (command && !seen.has(key)) {
          seen.set(key, {
            name: exe,
            displayName: await getFriendlyNameForApp(exe),
            command,
            iconPath: icon,
            isDefault: false
          });
        }
      })()
    );
  }

  const systemApplications = await getSystemApplications(ext);
  for (const exe of systemApplications) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForSystemApp(exe);
        const key = `sysapp-${exe.toLowerCase()}`;
        if (command && !seen.has(key)) {
          seen.set(key, {
            name: exe,
            displayName: exe,
            command,
            iconPath: icon,
            isDefault: false
          });
        }
      })()
    );
  }

  // 添加对常见应用程序的查询
  const commonApps = ['WINWORD.EXE', 'EXCEL.EXE', 'POWERPNT.EXE', 'notepad.exe', 'mspaint.exe'];
  for (const appExe of commonApps) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForApp(appExe);
        const key = `common-${appExe.toLowerCase()}`;
        if (command && !seen.has(key)) {
          const displayName = await getFriendlyNameForApp(appExe);
          seen.set(key, {
            name: appExe,
            displayName: displayName,
            command,
            iconPath: icon,
            isDefault: false
          });
        }
      })()
    );
  }

  // 查询所有已注册的应用程序
  const allApps = await getAllApplications();
  for (const appExe of allApps) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForApp(appExe);
        const key = `allapp-${appExe.toLowerCase()}`;
        if (command && !seen.has(key)) {
          const displayName = await getFriendlyNameForApp(appExe);
          seen.set(key, {
            name: appExe,
            displayName: displayName,
            command,
            iconPath: icon,
            isDefault: false
          });
        }
      })()
    );
  }

  await Promise.all(tasks);
  return Array.from(seen.values());
}

function parseShellNewTemplate(keyPath) {
  try {
    const output = fs.existsSync; // placeholder to keep fs required
  } catch (err) {}
}

async function hasShellNew(ext) {
  try {
    await execReg(`reg query "HKCR\\${ext}\\ShellNew"`);
    return true;
  } catch (err) {
    return false;
  }
}

async function getFriendlyNameForProgId(progId) {
  try {
    const res = await execReg(`reg query "HKCR\\${progId}" /ve`);
    const name = parseDefaultValue(res);
    if (name) return name;
  } catch (err) {}
  return progId;
}

async function getFriendlyName(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}" /ve`);
    const progId = parseDefaultValue(res);
    if (progId) {
      try {
        const res2 = await execReg(`reg query "HKCR\\${progId}" /ve`);
        const name = parseDefaultValue(res2);
        if (name) return name;
      } catch (err) {}
    }
    return progId || ext;
  } catch (err) {
    return ext;
  }
}

async function getDefaultIcon(ext) {
  // try progId DefaultIcon then ext DefaultIcon
  try {
    const res = await execReg(`reg query "HKCR\\${ext}" /ve`);
    const progId = parseDefaultValue(res);
    if (progId) {
      try {
        const res2 = await execReg(`reg query "HKCR\\${progId}\\DefaultIcon" /ve`);
        const icon = parseDefaultValue(res2);
        if (icon) return icon;
      } catch (err) {}
    }
  } catch (err) {}
  try {
    const res3 = await execReg(`reg query "HKCR\\${ext}\\DefaultIcon" /ve`);
    const icon2 = parseDefaultValue(res3);
    if (icon2) return icon2;
  } catch (err) {}
  return '';
}

async function getShellNewTemplate(ext) {
  const parse = (text) => {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/FileName\s+REG_SZ\s+([^\r\n]+)/i);
      if (m) return { templatePath: m[1].trim() };
      const data = line.match(/Data\s+REG_BINARY\s+([0-9A-F ]+)/i);
      if (data) return { data: data[1].replace(/\s+/g, '') };
      const nullFile = line.match(/NullFile\s+/i);
      if (nullFile) return { nullFile: true };
    }
    return null;
  };

  // ext key
  try {
    const res = await execReg(`reg query "HKCR\\${ext}\\ShellNew"`);
    const parsed = parse(res);
    if (parsed) return parsed;
  } catch (err) {}

  // progId key
  try {
    const progId = await getProgId(ext);
    if (progId) {
      const res2 = await execReg(`reg query "HKCR\\${progId}\\ShellNew"`);
      const parsed2 = parse(res2);
      if (parsed2) return parsed2;
    }
  } catch (err) {}

  return {};
}

async function getNewFileTypes() {
  const commonExts = [
    // 文档类
    '.txt', '.rtf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf',
    // 图片类
    '.bmp', '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.ico',
    // 音频类
    '.mp3', '.wav', '.wma',
    // 视频类
    '.avi', '.mp4', '.wmv', '.mov',
    // 压缩类
    '.zip', '.rar', '.7z',
    // 代码类
    '.html', '.css', '.js', '.json', '.xml',
    // 其他
    '.log', '.csv', '.md'
  ];

  const discovered = await (async () => {
    try {
      const output = await execReg('reg query HKCR /f ShellNew /s /k');
      const lines = output.split(/\r?\n/);
      const set = new Set();
      for (const line of lines) {
        const m = line.match(/HKEY_CLASSES_ROOT\\(\.[^\\]+)\\ShellNew/i);
        if (m) {
          const ext = m[1].startsWith('.') ? m[1].toLowerCase() : null;
          if (ext) set.add(ext);
        }
      }
      return Array.from(set);
    } catch (err) {
      return [];
    }
  })();

  const extSet = new Set([...commonExts.map((e) => e.toLowerCase()), ...discovered]);

  const results = [];
  for (const ext of Array.from(extSet).sort()) {
    if (!(await hasShellNew(ext))) continue;
    const name = await getFriendlyName(ext);
    const iconPath = await getDefaultIcon(ext);
    const templateInfo = await getShellNewTemplate(ext);
    results.push({
      extension: ext,
      name,
      iconPath,
      templatePath: templateInfo.templatePath || null,
      data: templateInfo.data || null
    });
  }
  return results;
}

module.exports = {
  getOpenWithApps,
  getNewFileTypes
};
