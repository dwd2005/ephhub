const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const { randomUUID } = require('crypto');
const fs = require('fs-extra');
const { readConfig, writeConfig } = require('./config');
const { DatabaseManager } = require('./db');
const { WatcherManager } = require('./watchers');
const fileService = require('./fileService');

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
    mainWindow.loadFile(path.join(__dirname, '.', 'dist', 'index.html'));
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

  withErrorHandling('fs:set-level', async (_evt, payload) => {
    const { rootId, targets, levelTag } = payload;
    const root = ensureRoot(rootId);
    const abs = targets.map((rel) => path.join(root.path, rel));
    await db.setLevelTag(abs, levelTag);
    return true;
  });

  withErrorHandling('fs:set-custom-time', async (_evt, payload) => {
    const { rootId, targets, customTime } = payload;
    const root = ensureRoot(rootId);
    const abs = targets.map((rel) => path.join(root.path, rel));
    await db.setCustomTime(abs, customTime);
    return true;
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
  createWindow();
  await startWatchers();
  registerIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
