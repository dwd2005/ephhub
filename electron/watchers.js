const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const { toRelative } = require('./fileService');

class WatcherManager {
  constructor(db, sendEvent) {
    this.db = db;
    this.sendEvent = sendEvent;
    this.watchers = new Map();
  }

  startForRoot(root) {
    if (this.watchers.has(root.id)) return;
    const watcher = chokidar.watch(root.path, {
      ignoreInitial: true,
      depth: 99,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    watcher.on('add', (fullPath) => this.handleAdd(root, fullPath, false));
    watcher.on('addDir', (fullPath) => this.handleAdd(root, fullPath, true));
    watcher.on('change', (fullPath) => this.handleChange(root, fullPath));
    watcher.on('unlink', (fullPath) => this.handleDelete(root, fullPath));
    watcher.on('unlinkDir', (fullPath) => this.handleDelete(root, fullPath));

    this.watchers.set(root.id, watcher);
  }

  stopForRoot(rootId) {
    const watcher = this.watchers.get(rootId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(rootId);
    }
  }

  async handleAdd(root, fullPath, isDir, meta = {}) {
    try {
      const stat = await fs.stat(fullPath);
      await this.db.upsertFiles([
        {
          physical_path: fullPath,
          type: isDir || stat.isDirectory() ? 'dir' : 'file',
          level_tag: meta.level_tag ?? null,
          custom_time: meta.custom_time ?? null
        }
      ]);
      this.sendEvent({
        rootId: root.id,
        type: 'add',
        path: toRelative(root.path, fullPath)
      });
    } catch (err) {
      console.warn('watcher add failed', err);
    }
  }

  handleChange(root, fullPath) {
    this.sendEvent({
      rootId: root.id,
      type: 'change',
      path: toRelative(root.path, fullPath)
    });
  }

  async handleDelete(root, fullPath) {
    await this.db.deleteRecords([fullPath]);
    this.sendEvent({
      rootId: root.id,
      type: 'delete',
      path: toRelative(root.path, fullPath)
    });
  }
}

module.exports = {
  WatcherManager
};
