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
    // 事件合并与顺序修复：同一路径的事件在短时间内合并后再校验真实状态
    this.pending = new Map();
    this.reconcileDelayMs = 120;
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

  // 事件入口：统一走合并与状态校验，避免顺序错乱
  handleAdd(root, fullPath) {
    this.queueReconcile(root, fullPath, 'add');
  }

  handleChange(root, fullPath) {
    this.queueReconcile(root, fullPath, 'change');
  }

  handleDelete(root, fullPath) {
    this.queueReconcile(root, fullPath, 'delete');
  }

  // 合并短时间内的多事件，最终以真实文件状态为准
  queueReconcile(root, fullPath, hintType) {
    const existing = this.pending.get(fullPath);
    if (existing?.timer) clearTimeout(existing.timer);

    const payload = {
      root,
      fullPath,
      hintType,
      updatedAt: Date.now(),
      timer: null
    };

    payload.timer = setTimeout(() => {
      this.reconcilePath(payload).catch((err) => {
        console.warn('watcher reconcile failed', err);
      });
    }, this.reconcileDelayMs);

    this.pending.set(fullPath, payload);
  }

  async reconcilePath(payload) {
    const { root, fullPath, hintType } = payload;
    const latest = this.pending.get(fullPath);
    if (latest && latest.updatedAt !== payload.updatedAt) {
      return;
    }
    this.pending.delete(fullPath);

    try {
      const stat = await fs.stat(fullPath);
      // 如果是内部操作，优先使用记录的元数据，避免重命名/移动时丢失标签
      const trackedMeta = this.operationTracker
        ? this.operationTracker.takeMetaAndClear(fullPath)
        : null;
      const type = stat.isDirectory() ? 'dir' : 'file';
      // 始终更新类型，避免文件/文件夹类型不一致
      await this.db.upsertFileTypes([
        {
          physical_path: fullPath,
          type
        }
      ]);
      // 自定义时间只在为空时写入创建时间，避免覆盖用户设置
      const fallbackTime = new Date(stat.birthtimeMs).toISOString();
      await this.db.setCustomTimeIfNull([
        {
          physical_path: fullPath,
          type,
          custom_time: trackedMeta?.custom_time ?? fallbackTime
        }
      ]);
      // 等级标签：若元数据包含该字段则写入（允许为 null）
      if (trackedMeta && Object.prototype.hasOwnProperty.call(trackedMeta, 'level_tag')) {
        await this.db.setLevelTag([fullPath], trackedMeta.level_tag);
      }
      this.sendEvent({
        rootId: root.id,
        type: hintType === 'change' ? 'change' : 'add',
        path: toRelative(root.path, fullPath)
      });
    } catch (err) {
      if (err && err.code === 'ENOENT') {
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
        return;
      }
      throw err;
    }
  }
}

module.exports = {
  WatcherManager
};
