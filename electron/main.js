const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, clipboard } = require('electron');
const { randomUUID } = require('crypto');
const fs = require('fs-extra');
const { readConfig, writeConfig } = require('./config');
const { DatabaseManager } = require('./db');
const { WatcherManager } = require('./watchers');
const fileService = require('./fileService');
const { getOpenWithApps, getNewFileTypes } = require('./registry');
const { exec } = require('child_process');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow;
let config = readConfig();
const db = new DatabaseManager();
const operationStatus = new Map();
const watcherManager = new WatcherManager(db, (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('fs-change', payload);
  }
});

// --- icon cache & helpers --------------------------------------------------
const iconCache = new Map(); // key: `${path}|${size}` -> dataURL
async function getIconData(targetPath, size = 'small') {
  if (!targetPath) return '';
  const sanitized = (targetPath || '').replace(/^"|"$/g, '');
  const filePath = sanitized.includes(',') ? sanitized.split(',')[0] : sanitized;
  const key = `${filePath}|${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  try {
    const icon = await app.getFileIcon(filePath, { size });
    const dataUrl = icon ? icon.toDataURL() : '';
    if (dataUrl) iconCache.set(key, dataUrl);
    return dataUrl;
  } catch (err) {
    return '';
  }
}

// --- open-with recent tracking ---------------------------------------------
const RECENT_PATH = app ? path.join(app.getPath('userData'), 'openwith-recent.json') : null;
let recentOpenWith = {};

function loadRecentOpenWith() {
  if (!RECENT_PATH) return;
  try {
    if (fs.existsSync(RECENT_PATH)) {
      recentOpenWith = JSON.parse(fs.readFileSync(RECENT_PATH, 'utf8') || '{}');
    }
  } catch (err) {
    recentOpenWith = {};
  }
}

function saveRecentOpenWith() {
  if (!RECENT_PATH) return;
  try {
    fs.ensureFileSync(RECENT_PATH);
    fs.writeJsonSync(RECENT_PATH, recentOpenWith, { spaces: 2 });
  } catch (err) {
    // best effort
  }
}

function rememberOpenWith(ext, appEntry) {
  if (!ext || !appEntry) return;
  const key = ext.toLowerCase();
  if (!recentOpenWith[key]) recentOpenWith[key] = [];
  const list = recentOpenWith[key].filter((item) => item.command !== appEntry.command);
  list.unshift({
    command: appEntry.command,
    name: appEntry.name,
    displayName: appEntry.displayName,
    iconPath: appEntry.iconPath || '',
    lastUsed: Date.now()
  });
  // keep only recent 10
  recentOpenWith[key] = list.slice(0, 10);
  saveRecentOpenWith();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1100,
    minHeight: 720,
    title: 'DataHelper PC',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1f1f' : '#f5f6fa',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function getRootById(rootId) {
  return config.roots.find((r) => r.id === rootId);
}

function persistConfig(next) {
  config = next;
  writeConfig(config);
}

async function startWatchers() {
  for (const root of config.roots) {
    await fileService.scanRoot(root.path, db);
    watcherManager.startForRoot(root);
  }
}

function withErrorHandling(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      return { ok: true, data: await handler(event, payload) };
    } catch (err) {
      console.error(`[${channel}] failed`, err);
      return { ok: false, message: err.message || 'Unexpected error' };
    }
  });
}

function ensureRoot(rootId) {
  const root = getRootById(rootId);
  if (!root) {
    throw new Error('Root directory not found');
  }
  return root;
}

function markOperation(targetPath, operation) {
  operationStatus.set(targetPath, { operation, startTime: Date.now() });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('operation-start', { path: targetPath, operation });
  }
}

function clearOperation(targetPath) {
  operationStatus.delete(targetPath);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('operation-end', { path: targetPath });
  }
}

async function runWithStatus(paths, operation, task) {
  paths.forEach((p) => markOperation(p, operation));
  try {
    return await task();
  } finally {
    paths.forEach((p) => clearOperation(p));
  }
}

async function getClipboardFilePaths() {
  const fileListBuffer = clipboard.readBuffer('FileNameW');
  let paths = [];
  if (fileListBuffer && fileListBuffer.length) {
    const raw = fileListBuffer.toString('ucs2');
    paths = raw.split('\u0000').filter(Boolean).map((p) => p.replace(/^\\\\\?\\/, ''));
  }
  if (!paths.length) {
    const text = clipboard.readText().trim();
    if (text) {
      paths = text
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);
    }
  }
  const existing = [];
  for (const p of paths) {
    try {
      const stat = await fs.stat(p);
      if (stat.isFile() || stat.isDirectory()) {
        existing.push(p);
      }
    } catch (err) {
      // ignore invalid paths
    }
  }
  return existing;
}

function registerIpc() {
  withErrorHandling('dialog:chooseRoot', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  withErrorHandling('dialog:chooseFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths.length) return [];
    return result.filePaths;
  });

  withErrorHandling('config:get', async () => config);

  withErrorHandling('roots:add', async (_evt, payload) => {
    const { name, path: rootPath } = payload;
    if (!rootPath) throw new Error('Path is required');
    const stat = await fs.stat(rootPath);
    if (!stat.isDirectory()) throw new Error('Path must be a directory');
    const id = randomUUID();
    const nextRoot = { id, name: name || path.basename(rootPath), path: rootPath };
    persistConfig({
      ...config,
      roots: [...config.roots, nextRoot],
      lastRootId: id
    });
    watcherManager.startForRoot(nextRoot);
    return nextRoot;
  });

  withErrorHandling('roots:remove', async (_evt, payload) => {
    const { id } = payload;
    const existing = getRootById(id);
    if (!existing) return null;
    watcherManager.stopForRoot(id);
    const nextRoots = config.roots.filter((r) => r.id !== id);
    persistConfig({ ...config, roots: nextRoots, lastRootId: nextRoots[0]?.id || null });
    return id;
  });

  withErrorHandling('roots:rename', async (_evt, payload) => {
    const { id, name } = payload;
    persistConfig({
      ...config,
      roots: config.roots.map((r) => (r.id === id ? { ...r, name } : r))
    });
    return getRootById(id);
  });

  withErrorHandling('fs:list', async (_evt, payload) => {
    const { rootId, relativePath } = payload;
    const root = ensureRoot(rootId);
    return fileService.listDirectory(root.path, relativePath || '.', db);
  });

  withErrorHandling('fs:time-buckets', async (_evt, payload) => {
    const { rootId } = payload;
    const root = ensureRoot(rootId);
    return fileService.buildTimeBuckets(root.path, db);
  });

  withErrorHandling('fs:create-folder', async (_evt, payload) => {
    const { rootId, relativePath, name } = payload;
    const root = ensureRoot(rootId);
    const dest = await fileService.createFolder(root.path, relativePath, name);
    await watcherManager.handleAdd(root, dest, true);
    return dest;
  });

  withErrorHandling('fs:create-file', async (_evt, payload) => {
    const { rootId, relativePath, name, templatePath, content, data } = payload;
    const root = ensureRoot(rootId);
    const dest = await fileService.createFile(
      root.path,
      relativePath,
      name,
      templatePath,
      content,
      data
    );
    await watcherManager.handleAdd(root, dest, false);
    return dest;
  });

  withErrorHandling('fs:upload', async (_evt, payload) => {
    const { rootId, relativePath, files } = payload;
    const root = ensureRoot(rootId);
    const destPaths = files.map((file) => path.join(root.path, relativePath, path.basename(file)));
    return runWithStatus(destPaths, 'upload', async () => {
      const created = await fileService.uploadFiles(root.path, relativePath, files);
      await Promise.all(created.map((full) => watcherManager.handleAdd(root, full, false)));
      return created;
    });
  });

  withErrorHandling('fs:rename', async (_evt, payload) => {
    const { rootId, relativePath, name } = payload;
    const root = ensureRoot(rootId);
    const original = path.join(root.path, relativePath);
    return runWithStatus([original], 'rename', async () => {
      const prevInfo = (await db.getInfo([original]))[original] || {};
      const target = await fileService.renameEntry(root.path, relativePath, name);
      await watcherManager.handleAdd(root, target, false, {
        level_tag: prevInfo.levelTag ?? null,
        custom_time: prevInfo.customTime ?? null
      });
      await db.deleteRecords([original]);
      return target;
    });
  });

  withErrorHandling('fs:delete', async (_evt, payload) => {
    const { rootId, targets } = payload;
    const root = ensureRoot(rootId);
    const absTargets = targets.map((rel) => path.join(root.path, rel));
    return runWithStatus(absTargets, 'delete', async () => {
      const deleted = await fileService.deleteEntries(root.path, targets);
      for (const rel of targets) {
        await watcherManager.handleDelete(root, path.join(root.path, rel));
      }
      return deleted;
    });
  });

  withErrorHandling('fs:move', async (_evt, payload) => {
    const { rootId, targets, destination } = payload;
    const root = ensureRoot(rootId);
    const absTargets = targets.map((rel) => path.join(root.path, rel));
    return runWithStatus(absTargets, 'move', async () => {
      const moved = await fileService.moveEntries(root.path, targets, destination);
      const infoMap = await db.getInfo(absTargets);
      await db.deleteRecords(absTargets);
      await Promise.all(
        moved.map(({ to }, idx) =>
          watcherManager.handleAdd(root, to, false, {
            level_tag: infoMap[absTargets[idx]]?.levelTag ?? null,
            custom_time: infoMap[absTargets[idx]]?.customTime ?? null
          })
        )
      );
      return moved;
    });
  });

  withErrorHandling('fs:copy', async (_evt, payload) => {
    const { rootId, targets, destination } = payload;
    const root = ensureRoot(rootId);
    const absTargets = targets.map((rel) => path.join(root.path, rel));
    return runWithStatus(absTargets, 'copy', async () => {
      const copied = await fileService.copyEntries(root.path, targets, destination);
      await Promise.all(copied.map(({ to }) => watcherManager.handleAdd(root, to, false)));
      return copied;
    });
  });

  withErrorHandling('clipboard:get-files', async () => {
    return getClipboardFilePaths();
  });

  withErrorHandling('fs:paste-clipboard', async (_evt, payload) => {
    const { rootId, relativePath } = payload;
    const root = ensureRoot(rootId);
    const sources = await getClipboardFilePaths();
    if (!sources.length) return [];

    const plannedTargets = sources.map((src) =>
      path.join(root.path, relativePath || '.', path.basename(src))
    );
    return runWithStatus(plannedTargets, 'copy', async () => {
      const copied = await fileService.importExternalEntries(
        root.path,
        relativePath || '.',
        sources
      );
      await Promise.all(copied.map(({ to }) => watcherManager.handleAdd(root, to, false)));
      return copied;
    });
  });

  withErrorHandling('fs:import-external', async (_evt, payload) => {
    const { rootId, relativePath = '.', files = [] } = payload;
    const root = ensureRoot(rootId);
    const validSources = [];
    for (const p of files) {
      try {
        const stat = await fs.stat(p);
        if (stat.isFile() || stat.isDirectory()) validSources.push(p);
      } catch (err) {
        // ignore missing
      }
    }
    if (!validSources.length) return [];
    const planned = validSources.map((src) =>
      path.join(root.path, relativePath || '.', path.basename(src))
    );
    return runWithStatus(planned, 'copy', async () => {
      const copied = await fileService.importExternalEntries(
        root.path,
        relativePath || '.',
        validSources
      );
      await Promise.all(copied.map(({ to }) => watcherManager.handleAdd(root, to, false)));
      return copied;
    });
  });

  withErrorHandling('fs:clean-temp', async (_evt, payload) => {
    const { rootId, targets = [], basePath = '.' } = payload;
    const root = ensureRoot(rootId);
    const baseList = targets.length ? targets : [basePath || '.'];
    const absList = baseList.map((rel) => fileService.ensureInsideRoot(root.path, path.join(root.path, rel)));

    const levelCache = new Map();
    const getLevel = async (absPath) => {
      if (levelCache.has(absPath)) return levelCache.get(absPath);
      const info = await db.getInfo([absPath]);
      const level = info[absPath]?.levelTag ?? null;
      levelCache.set(absPath, level);
      return level;
    };

    const cleanNode = async (absPath) => {
      const stat = await fs.stat(absPath);
      const level = await getLevel(absPath);

      if (stat.isFile()) {
        if (level === 'temp') {
          await shell.trashItem(absPath);
          await watcherManager.handleDelete(root, absPath);
          return { hasNonTemp: false };
        }
        return { hasNonTemp: true };
      }

      // directory
      const children = await fs.readdir(absPath);
      let hasNonTempChild = false;
      for (const name of children) {
        const child = path.join(absPath, name);
        const result = await cleanNode(child);
        if (result.hasNonTemp) hasNonTempChild = true;
      }

      const isTempDir = level === 'temp';
      if (isTempDir && !hasNonTempChild) {
        await shell.trashItem(absPath);
        await watcherManager.handleDelete(root, absPath);
        return { hasNonTemp: false };
      }

      // keep directory itself
      return { hasNonTemp: true };
    };

    return runWithStatus(absList, 'delete', async () => {
      for (const abs of absList) {
        await cleanNode(abs);
      }
      return true;
    });
  });

  withErrorHandling('fs:delete-by-level', async (_evt, payload) => {
    const { rootId, levelTag } = payload;
    const root = ensureRoot(rootId);
    const rows = await db.listByLevel(root.path, levelTag);
    const rels = rows.map((r) => fileService.toRelative(root.path, r.physical_path));
    const absTargets = rows.map((r) => r.physical_path);
    return runWithStatus(absTargets, 'delete', async () => {
      const deleted = await fileService.deleteEntries(root.path, rels);
      await db.deleteRecords(absTargets);
      for (const rel of rels) {
        await watcherManager.handleDelete(root, path.join(root.path, rel));
      }
      return deleted;
    });
  });

  withErrorHandling('fs:set-level', async (_evt, payload) => {
    const { rootId, targets, levelTag } = payload;
    const root = ensureRoot(rootId);
    const abs = targets.map((rel) => path.join(root.path, rel));
    await db.setLevelTag(abs, levelTag);
    return true;
  });

  withErrorHandling('fs:get-icon', async (_evt, payload) => {
    const { path: targetPath, size = 'small' } = payload || {};
    return getIconData(targetPath, size);
  });

  withErrorHandling('fs:set-custom-time', async (_evt, payload) => {
    const { rootId, targets, customTime } = payload;
    const root = ensureRoot(rootId);
    const abs = targets.map((rel) => path.join(root.path, rel));
    await db.setCustomTime(abs, customTime);
    return true;
  });

  withErrorHandling('fs:get-open-with-apps', async (_evt, payload) => {
    const { filePath } = payload;
    const ext = path.extname(filePath) || '';
    if (!ext) return [];
    const lowerExt = ext.toLowerCase();
    const apps = await getOpenWithApps(ext);
    const seen = new Map();

    // default first
    const ordered = [];
    for (const app of apps) {
      if (app.isDefault) {
        const key = app.command || app.name;
        if (!seen.has(key)) {
          seen.set(key, true);
          ordered.push({ ...app, lastUsed: null });
        }
      }
    }

    // recent next
    const recents = (recentOpenWith[lowerExt] || []).sort((a, b) => b.lastUsed - a.lastUsed);
    for (const r of recents) {
      const key = r.command || r.name;
      if (seen.has(key)) continue;
      seen.set(key, true);
      ordered.push({
        name: r.name,
        displayName: r.displayName || r.name,
        command: r.command,
        iconPath: r.iconPath,
        isDefault: false,
        lastUsed: r.lastUsed || null
      });
    }

    // rest
    for (const app of apps) {
      const key = app.command || app.name;
      if (seen.has(key)) continue;
      seen.set(key, true);
      ordered.push({ ...app, lastUsed: null });
    }

    return ordered;
  });

  withErrorHandling('fs:get-new-file-types', async () => {
    return getNewFileTypes();
  });

  withErrorHandling('fs:open-with-app', async (_evt, payload) => {
    const { command, filePath, name, displayName, iconPath } = payload;
    if (!command || !filePath) return false;
    let finalCmd = command;
    if (/%1|%l|%L/i.test(finalCmd)) {
      finalCmd = finalCmd.replace(/%1|%l|%L/gi, `"${filePath}"`);
    } else {
      finalCmd = `${finalCmd} "${filePath}"`;
    }
    const ext = path.extname(filePath).toLowerCase();
    return new Promise((resolve, reject) => {
      exec(finalCmd, { windowsHide: true }, (err) => {
        if (err) return reject(err);
        rememberOpenWith(ext, { command, name, displayName, iconPath });
        resolve(true);
      });
    });
  });

  withErrorHandling('fs:open-with-dialog', async (_evt, payload) => {
    const { filePath } = payload;
    if (!filePath) return false;
    
    // 使用 PowerShell 调用 Windows 的"打开方式"对话框
    const psCmd = `powershell -Command "& {Add-Type -AssemblyName System.Windows.Forms; $ofd = New-Object System.Windows.Forms.OpenFileDialog; $ofd.Filter = '所有文件|*.*'; $ofd.FileName = '${filePath.replace(/'/g, "''")}'; $ofd.ShowDialog()}"`;
    
    return new Promise((resolve, reject) => {
      exec(psCmd, (err, stdout, stderr) => {
        if (err) {
          // 如果 PowerShell 失败，尝试使用 rundll32
          const cmd = `cmd.exe /c start "" rundll32.exe shell32.dll,OpenAs_RunDLL "${filePath}"`;
          exec(cmd, (err2) => {
            if (err2) return reject(err2);
            resolve(true);
          });
        } else {
          resolve(true);
        }
      });
    });
  });

  withErrorHandling('fs:open', async (_evt, payload) => {
    const { rootId, relativePath } = payload;
    const root = ensureRoot(rootId);
    const fullPath = path.join(root.path, relativePath);
    return shell.openPath(fullPath);
  });

  withErrorHandling('fs:reveal', async (_evt, payload) => {
    const { rootId, relativePath } = payload;
    const root = ensureRoot(rootId);
    const fullPath = path.join(root.path, relativePath);
    shell.showItemInFolder(fullPath);
    return true;
  });

  withErrorHandling('window:minimize', async () => {
    if (mainWindow) mainWindow.minimize();
    return true;
  });

  withErrorHandling('window:toggle-maximize', async () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return 'restored';
    }
    mainWindow.maximize();
    return 'maximized';
  });

  withErrorHandling('window:close', async () => {
    if (mainWindow) mainWindow.close();
    return true;
  });
}

app.whenReady().then(async () => {
  loadRecentOpenWith();
  createWindow();
  registerIpc();

  try {
    await startWatchers();
  } catch (err) {
    console.error('startWatchers failed, continuing without watchers', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
