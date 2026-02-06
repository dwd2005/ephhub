const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const { toRelative } = require('./fileService');

class WatcherManager {
  constructor(db, sendEvent, operationTracker = null) {
    this.db = db;
    this.sendEvent = sendEvent;
    // 内部操作记录，用于匹配 watcher 事件和携带元数据
    this.operationTracker = operationTracker;
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
      // 如果是内部操作，优先使用记录的元数据，避免重命名/移动时丢失标签
      const trackedMeta = this.operationTracker
        ? this.operationTracker.takeMetaAndClear(fullPath)
        : null;
      await this.db.upsertFiles([
        {
          physical_path: fullPath,
          type: isDir || stat.isDirectory() ? 'dir' : 'file',
          level_tag: trackedMeta?.level_tag ?? meta.level_tag ?? null,
          custom_time: trackedMeta?.custom_time ?? meta.custom_time ?? null
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
    // 删除事件到达时清理内部记录，避免超时补救重复执行
    if (this.operationTracker) {
      this.operationTracker.clear(fullPath);
    }
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
