const { execReg, parseDefaultValue } = require('./utils');

async function getProgId(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}" /ve`);
    return parseDefaultValue(res);
  } catch (err) {
    return '';
  }
}

async function getFriendlyNameForProgId(progId) {
  try {
    const res = await execReg(`reg query "HKCR\\${progId}" /ve`);
    const name = parseDefaultValue(res);
    if (name && name.toLowerCase() !== 'value not set') return name;
  } catch (err) {}
  return progId;
}

async function getFriendlyNameForApp(appExe) {
  try {
    const res = await execReg(`reg query "HKCR\\Applications\\${appExe}" /ve`);
    const name = parseDefaultValue(res);
    if (name && name.toLowerCase() !== 'value not set') return name;
  } catch (err) {}
  return appExe;
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
    const match = res.match(/Icon\s+REG_[A-Z_]+\s+([^\r\n]+)/i);
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

async function getAllApplications() {
  try {
    const res = await execReg(`reg query "HKCR\\Applications"`);
    const lines = res.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((line) => line && !line.startsWith('HKEY') && line.toLowerCase().includes('.exe'))
      .map((line) => line.split(/\s+/)[0])
      .filter((v) => v && v !== '(Default)');
  } catch (err) {
    return [];
  }
}

async function getOpenWithApps(ext) {
  const seen = new Map();
  const tasks = [];

  const progId = await getProgId(ext);
  if (progId) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForProgId(progId);
        const key = progId.toLowerCase();
        if (command && !seen.has(key)) {
          const displayName = await getFriendlyNameForProgId(progId);
          seen.set(key, { name: progId, displayName, command, iconPath: icon, isDefault: true });
        }
      })()
    );
  }

  const addApps = (list, keyPrefix = '') => {
    for (const exe of list) {
      tasks.push(
        (async () => {
          const { command, icon } = await getCommandAndIconForApp(exe);
          const key = `${keyPrefix}${exe.toLowerCase()}`;
          if (command && !seen.has(key)) {
            const displayName = await getFriendlyNameForApp(exe);
            seen.set(key, { name: exe, displayName, command, iconPath: icon, isDefault: false });
          }
        })()
      );
    }
  };

  addApps(await getOpenWithList(ext));
  for (const pid of await getOpenWithProgIds(ext)) {
    tasks.push(
      (async () => {
        const { command, icon } = await getCommandAndIconForProgId(pid);
        const key = pid.toLowerCase();
        if (command && !seen.has(key)) {
          const displayName = await getFriendlyNameForProgId(pid);
          seen.set(key, { name: pid, displayName, command, iconPath: icon, isDefault: false });
        }
      })()
    );
  }
  addApps(await getSystemOpenWithList(ext), 'sys-');
  addApps(await getSystemApplications(ext), 'sysapp-');

  // common apps fallback
  addApps(['WINWORD.EXE', 'EXCEL.EXE', 'POWERPNT.EXE', 'notepad.exe', 'mspaint.exe'], 'common-');
  addApps(await getAllApplications(), 'all-');

  await Promise.all(tasks);
  return Array.from(seen.values());
}

module.exports = { getOpenWithApps };
