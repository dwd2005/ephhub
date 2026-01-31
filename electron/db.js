const path = require('path');
const sqlite3 = require('sqlite3');
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'metadata.db');
    this.db = new sqlite3.Database(dbPath);
    this.ready = this.init();
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
    for (const row of records) {
      await this.run(sql, [row.physical_path, row.type, row.level_tag, row.custom_time]);
    }
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
    for (const path of targets) {
      await this.run(sql, [path, levelTag]);
    }
  }

  async setCustomTime(targets, customTime) {
    await this.ready;
    if (!targets.length) return;
    const sql = `
      INSERT INTO files(physical_path, type, level_tag, custom_time)
      VALUES (?, NULL, NULL, ?)
      ON CONFLICT(physical_path) DO UPDATE SET custom_time=excluded.custom_time
    `;
    for (const path of targets) {
      await this.run(sql, [path, customTime]);
    }
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
