const path = require('path');
const sqlite3 = require('sqlite3');
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'metadata.db');
    this.db = new sqlite3.Database(dbPath);
    this.ready = this.init();
    // 事务串行队列，避免并发 BEGIN 导致嵌套事务错误
    this.txQueue = Promise.resolve();
  }

  async init() {
    await this.run('PRAGMA journal_mode = WAL;');
    await this.run(`
      CREATE TABLE IF NOT EXISTS files (
        physical_path TEXT PRIMARY KEY,
        type TEXT,
        level_tag TEXT,
        custom_time TEXT
      );
    `);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_files_level ON files(level_tag);`);
  }

  // 事务控制：用于多步写入时保证原子性
  async beginTransaction() {
    await this.run('BEGIN IMMEDIATE;');
  }

  async commitTransaction() {
    await this.run('COMMIT;');
  }

  async rollbackTransaction() {
    await this.run('ROLLBACK;');
  }

  // 事务包装：失败自动回滚
  async runInTransaction(task) {
    await this.ready;
    const runTask = async () => {
      await this.beginTransaction();
      try {
        const result = await task();
        await this.commitTransaction();
        return result;
      } catch (err) {
        try {
          await this.rollbackTransaction();
        } catch (rollbackErr) {
          // 回滚失败也不覆盖原始错误
          console.warn('DB rollback failed', rollbackErr);
        }
        throw err;
      }
    };

    const next = this.txQueue.then(runTask, runTask);
    // 不阻塞后续任务队列
    this.txQueue = next.catch(() => {});
    return next;
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  async upsertFiles(records) {
    if (!records.length) return;
    await this.ready;
    const sql = `
      INSERT INTO files(physical_path, type, level_tag, custom_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(physical_path) DO UPDATE SET
        type=excluded.type,
        level_tag=COALESCE(excluded.level_tag, files.level_tag),
        custom_time=COALESCE(excluded.custom_time, files.custom_time)
    `;
    const task = async () => {
      for (const row of records) {
        await this.run(sql, [row.physical_path, row.type, row.level_tag, row.custom_time]);
      }
    };
    if (records.length > 1) {
      await this.runInTransaction(task);
      return;
    }
    await task();
  }

  // 仅更新文件类型与缺失行，避免覆盖自定义元数据
  async upsertFileTypes(records) {
    if (!records.length) return;
    await this.ready;
    const sql = `
      INSERT INTO files(physical_path, type)
      VALUES (?, ?)
      ON CONFLICT(physical_path) DO UPDATE SET
        type=excluded.type
    `;
    const task = async () => {
      for (const row of records) {
        await this.run(sql, [row.physical_path, row.type]);
      }
    };
    if (records.length > 1) {
      await this.runInTransaction(task);
      return;
    }
    await task();
  }

  async getInfo(paths) {
    await this.ready;
    if (!paths.length) return {};
    const placeholders = paths.map(() => '?').join(',');
    const rows = await this.all(
      `SELECT physical_path, type, level_tag, custom_time FROM files WHERE physical_path IN (${placeholders})`,
      paths
    );
    return rows.reduce((acc, row) => {
      acc[row.physical_path] = {
        type: row.type,
        levelTag: row.level_tag,
        customTime: row.custom_time
      };
      return acc;
    }, {});
  }

  async setLevelTag(targets, levelTag) {
    await this.ready;
    if (!targets.length) return;
    const sql = `
      INSERT INTO files(physical_path, type, level_tag, custom_time)
      VALUES (?, NULL, ?, NULL)
      ON CONFLICT(physical_path) DO UPDATE SET level_tag=excluded.level_tag
    `;
    const task = async () => {
      for (const path of targets) {
        await this.run(sql, [path, levelTag]);
      }
    };
    if (targets.length > 1) {
      await this.runInTransaction(task);
      return;
    }
    await task();
  }

  async setCustomTime(targets, customTime) {
    await this.ready;
    if (!targets.length) return;
    const sql = `
      INSERT INTO files(physical_path, type, level_tag, custom_time)
      VALUES (?, NULL, NULL, ?)
      ON CONFLICT(physical_path) DO UPDATE SET custom_time=excluded.custom_time
    `;
    const task = async () => {
      for (const path of targets) {
        await this.run(sql, [path, customTime]);
      }
    };
    if (targets.length > 1) {
      await this.runInTransaction(task);
      return;
    }
    await task();
  }

  // 仅在 custom_time 为空时写入默认时间，避免覆盖用户自定义时间
  async setCustomTimeIfNull(records) {
    if (!records.length) return;
    await this.ready;
    const sql = `
      INSERT INTO files(physical_path, type, custom_time)
      VALUES (?, ?, ?)
      ON CONFLICT(physical_path) DO UPDATE SET
        type=COALESCE(excluded.type, files.type),
        custom_time=CASE
          WHEN files.custom_time IS NULL OR files.custom_time = '' THEN excluded.custom_time
          ELSE files.custom_time
        END
    `;
    const task = async () => {
      for (const row of records) {
        await this.run(sql, [row.physical_path, row.type || null, row.custom_time]);
      }
    };
    if (records.length > 1) {
      await this.runInTransaction(task);
      return;
    }
    await task();
  }

  async deleteRecords(paths) {
    await this.ready;
    if (!paths.length) return;
    const placeholders = paths.map(() => '?').join(',');
    await this.run(`DELETE FROM files WHERE physical_path IN (${placeholders})`, paths);
  }

  async listByRoot(rootPath) {
    await this.ready;
    return this.all(
      `SELECT physical_path, custom_time FROM files WHERE physical_path LIKE ? ORDER BY custom_time`,
      [`${rootPath}%`]
    );
  }

  async listByRootDetailed(rootPath) {
    await this.ready;
    return this.all(
      `SELECT physical_path, type, level_tag, custom_time FROM files WHERE physical_path LIKE ?`,
      [`${rootPath}%`]
    );
  }

  async listByLevel(rootPath, levelTag) {
    await this.ready;
    return this.all(
      `SELECT physical_path, type FROM files WHERE level_tag = ? AND physical_path LIKE ?`,
      [levelTag, `${rootPath}%`]
    );
  }
}

module.exports = {
  DatabaseManager
};
