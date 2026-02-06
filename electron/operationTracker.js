const fs = require('fs-extra');
const path = require('path');

class OperationTracker {
  constructor(db, options = {}) {
    this.db = db;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 5000;
    this.onTimeout = options.onTimeout || null;
    // 记录每个路径的内部操作状态，用于对齐 watcher 事件与超时补救
    this.records = new Map();
  }

  // 统一路径格式，减少不同写法导致的匹配失败
  normalizePath(targetPath) {
    return path.normalize(targetPath);
  }

  // 记录内部操作，便于 watcher 事件对齐与超时补救
  track(operation, paths, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const metaByPath = options.metaByPath || {};
    for (const p of paths) {
      const key = this.normalizePath(p);
      const prev = this.records.get(key);
      if (prev?.timer) clearTimeout(prev.timer);

      const record = {
        operation,
        path: key,
        startedAt: Date.now(),
        timeoutMs,
        meta: metaByPath[key] || null,
        timer: null
      };

      record.timer = setTimeout(() => {
        this.handleTimeout(record).catch((err) => {
          if (this.onTimeout) this.onTimeout(err, record);
        });
      }, timeoutMs);

      this.records.set(key, record);
    }
  }

  // 在 watcher 事件到达时调用，返回匹配的元数据并清理记录
  takeMetaAndClear(targetPath) {
    const key = this.normalizePath(targetPath);
    const record = this.records.get(key);
    if (!record) return null;
    if (record.timer) clearTimeout(record.timer);
    this.records.delete(key);
    return record.meta || null;
  }

  // 仅清理记录，不返回元数据
  clear(targetPath) {
    const key = this.normalizePath(targetPath);
    const record = this.records.get(key);
    if (!record) return false;
    if (record.timer) clearTimeout(record.timer);
    this.records.delete(key);
    return true;
  }

  clearMany(paths) {
    for (const p of paths) {
      this.clear(p);
    }
  }

  // 立即执行兜底同步，用于关键操作完成后快速修复数据库
  async syncNow(paths) {
    const tasks = [];
    for (const p of paths) {
      const key = this.normalizePath(p);
      const record = this.records.get(key);
      if (!record) continue;
      if (record.timer) clearTimeout(record.timer);
      tasks.push(this.handleTimeout(record));
    }
    await Promise.all(tasks);
  }

  // 超时兜底：根据真实文件状态修复数据库
  async handleTimeout(record) {
    this.records.delete(record.path);
    try {
      const stat = await fs.stat(record.path);
      const type = stat.isDirectory() ? 'dir' : 'file';
      await this.db.upsertFiles([
        {
          physical_path: record.path,
          type,
          // 有元数据则写入，没有则保持已有值
          level_tag: record.meta?.level_tag ?? null,
          custom_time: record.meta?.custom_time ?? null
        }
      ]);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // 路径不存在，删除对应记录
        await this.db.deleteRecords([record.path]);
        return;
      }
      throw err;
    }
  }
}

module.exports = {
  OperationTracker
};
