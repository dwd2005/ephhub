const { execReg, parseDefaultValue } = require('./utils');

async function getProgId(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}" /ve`);
    return parseDefaultValue(res);
  } catch (err) {
    return '';
  }
}

async function getFriendlyName(ext) {
  try {
    const res = await execReg(`reg query "HKCR\\${ext}" /ve`);
    const progId = parseDefaultValue(res);
    if (progId) {
      try {
        const res2 = await execReg(`reg query "HKCR\\${progId}" /ve`);
        const name = parseDefaultValue(res2);
        if (name && name.toLowerCase() !== 'value not set') return name;
      } catch (err) {}
      return progId;
    }
    return ext;
  } catch (err) {
    return ext;
  }
}

async function getDefaultIcon(ext) {
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

async function hasShellNew(ext) {
  try {
    await execReg(`reg query "HKCR\\${ext}\\ShellNew"`);
    return true;
  } catch (err) {
    try {
      const progId = await getProgId(ext);
      if (!progId) return false;
      await execReg(`reg query "HKCR\\${progId}\\ShellNew"`);
      return true;
    } catch (e) {
      return false;
    }
  }
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

  try {
    const res = await execReg(`reg query "HKCR\\${ext}\\ShellNew"`);
    const parsed = parse(res);
    if (parsed) return parsed;
  } catch (err) {}

  try {
    const progId = await getProgId(ext);
    if (progId) {
      const res = await execReg(`reg query "HKCR\\${progId}\\ShellNew"`);
      const parsed = parse(res);
      if (parsed) return parsed;
    }
  } catch (err) {}

  return {};
}

async function getNewFileTypes() {
  const commonExts = [
    '.txt', '.rtf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf',
    '.bmp', '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.ico',
    '.mp3', '.wav', '.wma',
    '.avi', '.mp4', '.wmv', '.mov',
    '.zip', '.rar', '.7z',
    '.html', '.css', '.js', '.json', '.xml',
    '.log', '.csv', '.md'
  ];

  const discovered = await (async () => {
    try {
      const output = await execReg('reg query HKCR /f ShellNew /s /k');
      const lines = output.split(/\r?\n/);
      const set = new Set();
      for (const line of lines) {
        const m = line.match(/HKEY_CLASSES_ROOT\\([^\\]+)\\ShellNew/i);
        if (!m) continue;
        const key = m[1];
        if (key.startsWith('.')) {
          set.add(key.toLowerCase());
        } else {
          try {
            const res = await execReg(`reg query "HKCR\\.${key}" /ve`);
            const progId = parseDefaultValue(res);
            if (progId && progId.toLowerCase() === key.toLowerCase()) {
              set.add(`.${key.toLowerCase()}`);
            }
          } catch (e) {}
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
    const friendly = await getFriendlyName(ext);
    const iconPath = await getDefaultIcon(ext);
    const templateInfo = await getShellNewTemplate(ext);
    results.push({
      extension: ext,
      name: friendly || ext.toUpperCase(),
      iconPath,
      templatePath: templateInfo.templatePath || null,
      data: templateInfo.data || null,
      nullFile: !!templateInfo.nullFile
    });
  }

  return results;
}

module.exports = { getNewFileTypes };
