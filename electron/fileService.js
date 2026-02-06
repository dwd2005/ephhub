const fs = require('fs-extra');
const path = require('path');
const dayjs = require('dayjs');
const { shell } = require('electron');

function ensureInsideRoot(rootPath, targetPath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw new Error('Path outside current root is not allowed');
  }
  return normalizedTarget;
}

function toRelative(rootPath, absPath) {
  return path.relative(rootPath, absPath) || '.';
}

async function listDirectory(rootPath, relativePath, db) {
  const resolved = ensureInsideRoot(rootPath, path.join(rootPath, relativePath));
  const names = await fs.readdir(resolved);
  const entries = [];
  for (const name of names) {
    const fullPath = path.join(resolved, name);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch (err) {
      // 并发变更场景下允许跳过异常条目，避免整体失败
      if (err && ['ENOENT', 'EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        continue;
      }
      throw err;
    }
    entries.push({
      name,
      fullPath,
      relativePath: toRelative(rootPath, fullPath),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      modified: stat.mtimeMs,
      created: stat.birthtimeMs,
      ext: stat.isDirectory() ? '' : path.extname(name).slice(1),
      type: stat.isDirectory() ? 'dir' : 'file'
    });
  }

  const infoMap = await db.getInfo(entries.map((e) => e.fullPath));
  entries.forEach((entry) => {
    const dbInfo = infoMap[entry.fullPath] || {};
    entry.levelTag = dbInfo.levelTag || null;
    entry.customTime = dbInfo.customTime || null;
  });

  // 仅更新类型和缺失行，避免覆盖自定义元数据
  await db.upsertFileTypes(
    entries.map((entry) => ({
      physical_path: entry.fullPath,
      type: entry.type
    }))
  );

  return entries;
}

async function buildTimeBuckets(rootPath, db) {
  const files = await db.listByRoot(rootPath);

  const results = [];
  for (const row of files) {
    let time = row.custom_time ? dayjs(row.custom_time).valueOf() : null;
    if (!time) {
      try {
        const stat = await fs.stat(row.physical_path);
        time = stat.birthtimeMs;
      } catch (err) {
        // 并发删除场景下清理记录并跳过
        if (err && err.code === 'ENOENT') {
          await db.deleteRecords([row.physical_path]);
          continue;
        }
        throw err;
      }
    }
    results.push({
      fullPath: row.physical_path,
      relativePath: toRelative(rootPath, row.physical_path),
      time
    });
  }
  return results;
}

async function scanRoot(rootPath, db) {
  if (!(await fs.pathExists(rootPath))) return;
  const records = [];
  async function walk(dir) {
    const names = await fs.readdir(dir);
    for (const name of names) {
      const fullPath = path.join(dir, name);
      const stat = await fs.stat(fullPath);
      records.push({
        physical_path: fullPath,
        type: stat.isDirectory() ? 'dir' : 'file',
        level_tag: null,
        custom_time: null
      });
      if (stat.isDirectory()) {
        await walk(fullPath);
      }
    }
  }

  await walk(rootPath);
  await db.upsertFiles(records);
}

async function createFolder(rootPath, relativePath, name) {
  const dest = ensureInsideRoot(rootPath, path.join(rootPath, relativePath, name));
  await fs.ensureDir(dest);
  return dest;
}

async function createFile(
  rootPath,
  relativePath,
  name,
  templatePath = null,
  content = '',
  data = null
) {
  const target = ensureInsideRoot(rootPath, path.join(rootPath, relativePath, name));
  await fs.ensureDir(path.dirname(target));
  if (await fs.pathExists(target)) {
    throw new Error('Target already exists');
  }

  if (templatePath) {
    const resolvedTemplate = path.resolve(templatePath);
    if (!(await fs.pathExists(resolvedTemplate))) {
      throw new Error('Template file not found');
    }
    await fs.copy(resolvedTemplate, target, { overwrite: false, errorOnExist: true });
  } else if (data) {
    const buffer = Buffer.from(data, 'hex');
    await fs.outputFile(target, buffer);
  } else {
    await fs.outputFile(target, content);
  }
  return target;
}

async function uploadFiles(rootPath, relativePath, filePaths) {
  const created = [];
  for (const file of filePaths) {
    const dest = ensureInsideRoot(rootPath, path.join(rootPath, relativePath, path.basename(file)));
    await fs.copy(file, dest, { overwrite: true });
    created.push(dest);
  }
  return created;
}

async function renameEntry(rootPath, relativePath, nextName) {
  const current = ensureInsideRoot(rootPath, path.join(rootPath, relativePath));
  const target = ensureInsideRoot(rootPath, path.join(path.dirname(current), nextName));
  await fs.move(current, target, { overwrite: false });
  return target;
}

async function deleteEntries(rootPath, relativePaths) {
  const targets = relativePaths.map((rel) => ensureInsideRoot(rootPath, path.join(rootPath, rel)));
  for (const t of targets) {
    await shell.trashItem(t);
  }
  return targets;
}

async function moveEntries(rootPath, relativePaths, destRelative) {
  const moved = [];
  const destBase = ensureInsideRoot(rootPath, path.join(rootPath, destRelative));
  await fs.ensureDir(destBase);

  for (const rel of relativePaths) {
    const from = ensureInsideRoot(rootPath, path.join(rootPath, rel));
    const to = ensureInsideRoot(rootPath, path.join(destBase, path.basename(rel)));
    await fs.move(from, to, { overwrite: false });
    moved.push({ from, to });
  }
  return moved;
}

function formatCopyName(baseName, attempt = 1) {
  const { name, ext } = path.parse(baseName);
  const suffix = attempt === 1 ? ' 副本' : ` 副本 (${attempt})`;
  const nextName = ext ? `${name}${suffix}${ext}` : `${name}${suffix}`;
  return nextName;
}

async function ensureUniqueName(destBase, desiredName, reserved = new Set()) {
  let candidate = desiredName;
  let attempt = 1;
  while (reserved.has(candidate) || (await fs.pathExists(path.join(destBase, candidate)))) {
    candidate = formatCopyName(desiredName, attempt);
    attempt += 1;
  }
  reserved.add(candidate);
  return candidate;
}

async function copyEntries(rootPath, relativePaths, destRelative) {
  const copied = [];
  const destBase = ensureInsideRoot(rootPath, path.join(rootPath, destRelative));
  await fs.ensureDir(destBase);
  const reserved = new Set();

  for (const rel of relativePaths) {
    const from = ensureInsideRoot(rootPath, path.join(rootPath, rel));
    const desiredName = path.basename(rel);
    const finalName = await ensureUniqueName(destBase, desiredName, reserved);
    const to = ensureInsideRoot(rootPath, path.join(destBase, finalName));
    await fs.copy(from, to, { overwrite: false, errorOnExist: false });
    copied.push({ from, to, finalName });
  }
  return copied;
}

async function importExternalEntries(rootPath, destRelative, sourcePaths) {
  const copied = [];
  const destBase = ensureInsideRoot(rootPath, path.join(rootPath, destRelative));
  await fs.ensureDir(destBase);
  const reserved = new Set();

  for (const source of sourcePaths) {
    if (!(await fs.pathExists(source))) continue;
    const desiredName = path.basename(source);
    const finalName = await ensureUniqueName(destBase, desiredName, reserved);
    const target = ensureInsideRoot(rootPath, path.join(destBase, finalName));
    await fs.copy(source, target, { overwrite: false, errorOnExist: false });
    copied.push({ from: source, to: target, finalName });
  }
  return copied;
}

module.exports = {
  ensureInsideRoot,
  listDirectory,
  buildTimeBuckets,
  createFolder,
  uploadFiles,
  renameEntry,
  deleteEntries,
  moveEntries,
  copyEntries,
  toRelative,
  scanRoot,
  createFile,
  importExternalEntries
};
